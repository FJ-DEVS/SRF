# Order Status Update System Documentation

## Overview

The system implements a **linear order status workflow** that tracks orders from creation to delivery. **Salesmen create orders** and **mark rolling as complete** (to roll → rolled), while **admins manage the full workflow** including assigning orders to be rolled and final billing/delivery steps. This document provides complete details about the status update functionality and workflow.

---

## Table of Contents

1. [Order Status States](#order-status-states)
2. [Status Update Endpoint](#status-update-endpoint)
3. [Workflow and Transition Rules](#workflow-and-transition-rules)
4. [Salesman's Role in Status Updates](#salesmans-role-in-status-updates)
5. [Backend Implementation](#backend-implementation)
6. [API Request Examples](#api-request-examples)
7. [Notifications](#notifications)
8. [Security & Authorization](#security--authorization)
9. [Frontend Integration](#frontend-integration)

---

## Order Status States

The system supports **5 distinct status states** for orders:

| Status | Description |
|--------|-------------|
| `pending` | Initial state when an order is created (default) |
| `to roll` | Order is marked ready to be processed/rolled |
| `rolled` | Order has been rolled/processed |
| `billed` | Order has been billed to the customer |
| `delivered` | Final state - Order has been delivered to customer |

### Status Characteristics

- **Default Status**: All orders are created with `pending` status
- **Linear Progression**: Status can only move forward, not backward
- **Validation**: Invalid status transitions are rejected with error messages
- **Final State**: Once `delivered`, no further transitions are allowed

---

## Status Update Endpoint

### **PUT** `/api/orders/:id/status`

Update the status of an order (Admin for most transitions; Salesman can update "to roll" → "rolled")

#### Request Headers
```http
Authorization: Bearer <admin_or_salesman_jwt_token>
Content-Type: application/json
```

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | String | Yes | MongoDB ObjectId of the order |

#### Request Body
```json
{
  "status": "billed"
}
```

#### Response (Success - 200)
```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f678901234f",
    "type": "sell order",
    "status": "billed",
    "items": [...],
    "customerName": {...},
    "cargo": {...},
    "createdBy": {...},
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T14:45:00.000Z"
  }
}
```

#### Error Responses

**Invalid Transition (400)**
```json
{
  "success": false,
  "message": "Cannot transition from pending to billed"
}
```

**Order Not Found (404)**
```json
{
  "success": false,
  "message": "Order not found"
}
```

**Unauthorized (401)**
```json
{
  "success": false,
  "message": "Access denied. No token provided."
}
```

**Forbidden - Salesman Invalid Transition (403)**
```json
{
  "success": false,
  "message": "Salesmen can only update orders from \"to roll\" to \"rolled\""
}
```

**Forbidden - Not Admin (403)**
```json
{
  "success": false,
  "message": "Access denied. Admin privileges required."
}
```

---

## Workflow and Transition Rules

### Valid Status Transitions

The system enforces strict transition rules with role-based permissions:

```
pending ──────> to roll ──────> rolled ──────> billed ──────> delivered
  (Admin)       (Admin)       (Salesman)      (Admin)         (Admin)
   │               │               │               │               │
   └──────────────────────────────────────────────────────────────┘
           ❌ No backward transitions allowed ❌
```

### Transition Matrix

| Current Status | Allowed Next Status | Who Can Update |
|---------------|---------------------|----------------|
| `pending` | `to roll` only | Admin |
| `to roll` | `rolled` only | **Salesman** |
| `rolled` | `billed` only | Admin |
| `billed` | `delivered` only | Admin |
| `delivered` | ❌ No transitions (final state) | N/A |

### Invalid Transition Examples

❌ **These will be rejected:**
- `pending` → `billed` (skipping states)
- `to roll` → `pending` (backward movement)
- `delivered` → `pending` (backward from final state)
- `pending` → `delivered` (skipping multiple states)

### Backend Validation Logic

```javascript
const validTransitions = {
  'pending': ['to roll'],
  'to roll': ['rolled'],
  'rolled': ['billed'],
  'billed': ['delivered']
};

// Validation check
if (!validTransitions[order.status] || 
    !validTransitions[order.status].includes(newStatus)) {
  return res.status(400).json({ 
    message: `Cannot transition from ${order.status} to ${newStatus}` 
  });
}
```

---

## Salesman's Role in Status Updates

### Permissions Summary

| Action | Salesman | Admin |
|--------|----------|-------|
| Create orders | ✅ (sell orders only) | ✅ (all types) |
| View own orders | ✅ | ✅ (all orders) |
| View "to roll" orders | ✅ (all) | ✅ (all orders) |
| View all orders | ❌ | ✅ |
| Update "to roll" → "rolled" | ✅ | ✅ |
| Update other statuses | ❌ | ✅ |
| Update order details | ❌ | ✅ |
| Delete orders | ❌ | ✅ |

### Salesman Workflow

```
┌─────────────┐
│  Salesman   │
└──────┬──────┘
       │
       │ 1. Creates Sell Order
       ▼
┌─────────────────────────┐
│  Order (status: pending) │
└──────┬──────────────────┘
       │
       │ 2. Admin assigns work
       ▼
┌─────────────────────────┐
│  Order (status: to roll) │
└──────┬──────────────────┘
       │
       │ 3. Salesman sees "to roll" orders
       │ 4. Completes rolling work
       │ 5. Updates status to "rolled"
       ▼
┌─────────────────────────┐
│  Order (status: rolled)  │
└──────┬──────────────────┘
       │
       │ 6. Admin continues workflow
       │    rolled → billed → delivered
       ▼
┌──────────────────┐
│ Customer receives│
│ delivery & alert │
└──────────────────┘
```

### Salesman Order Creation

When a salesman creates an order:

```javascript
// Automatic settings
{
  createdBy: salesmanId,           // Salesman's MongoDB _id
  createdByType: 'salesman',       // Type identifier
  status: 'pending',               // Always starts as pending
  type: 'sell order'               // Salesmen can only create sell orders
}
```

### Salesman Capabilities & Restrictions

#### ✅ What Salesmen CAN Do:

1. **Read Access**: View orders they created + all "to roll" orders
2. **Status Update**: Update orders from "to roll" to "rolled"
3. **Create Orders**: Create sell orders (not purchase orders)

#### ❌ What Salesmen CANNOT Do:

1. **Other Status Updates**: Cannot update pending, rolled, billed, or delivered statuses
2. **Purchase Orders**: Cannot create purchase orders
3. **Order Deletion**: Cannot delete any orders
4. **Order Editing**: Cannot modify order details after creation
5. **View All**: Cannot view all orders (only own + to roll)

---

## Backend Implementation

### File Structure

```
backend/
├── models/
│   └── Order.js                 # Order schema with status field
├── controllers/
│   └── orderController.js       # updateOrderStatus function
├── routes/
│   └── order.js                 # Status update route definition
└── middleware/
    ├── auth.js                  # Admin authentication
    └── salesmanAuth.js          # Salesman authentication
```

### Model Definition

**File**: `backend/models/Order.js`

```javascript
const orderSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: {
      values: ['pending', 'to roll', 'rolled', 'billed', 'delivered'],
      message: 'Invalid status'
    },
    default: 'pending'
  },
  createdBy: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  createdByType: {
    type: String,
    enum: ['admin', 'salesman'],
    required: true
  },
  type: {
    type: String,
    enum: ['sell order', 'purchase order'],
    required: true
  },
  items: [{ item: ObjectId, quantity: Number }],
  customerName: { type: ObjectId, ref: 'Customer' },
  cargo: { type: ObjectId, ref: 'Cargo' }
});
```

### Controller Function

**File**: `backend/controllers/orderController.js`

```javascript
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    // Valid status transitions
    const validTransitions = {
      'pending': ['to roll'],
      'to roll': ['rolled'],
      'rolled': ['billed'],
      'billed': ['delivered']
    };

    const order = await Order.findById(req.params.id)
      .populate('customerName');

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    // Salesman can only update "to roll" → "rolled"
    if (req.user.role === 'salesman') {
      if (order.status !== 'to roll' || status !== 'rolled') {
        return res.status(403).json({ 
          success: false, 
          message: 'Salesmen can only update orders from "to roll" to "rolled"' 
        });
      }
    }

    // Check valid transition
    if (!validTransitions[order.status] || 
        !validTransitions[order.status].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot transition from ${order.status} to ${status}` 
      });
    }

    // Update status
    order.status = status;
    await order.save();

    // Send WhatsApp notification if delivered
    if (status === 'delivered' && order.customerName) {
      await sendWhatsAppMessage(
        order.customerName.phone,
        order.customerName.name
      );
    }

    await order.populate(['items.item', 'cargo']);

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });

  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error' 
    });
  }
};
```

### Route Definition

**File**: `backend/routes/order.js`

```javascript
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const anyAuthMiddleware = require('./anyAuthMiddleware'); // Admin OR Salesman
const orderController = require('../controllers/orderController');

// Status update - Both admin and salesman allowed (with restrictions in controller)
router.put('/:id/status', anyAuthMiddleware, orderController.updateOrderStatus);
```

### Middleware Protection

**File**: `backend/middleware/auth.js`

```javascript
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. No token provided.' 
    });
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  
  if (decoded.role !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      message: 'Access denied. Admin privileges required.' 
    });
  }

  req.user = decoded;
  next();
};
```

---

## API Request Examples

### Example 1: Update Pending to To Roll

**Request**
```bash
curl -X PUT http://localhost:5000/api/orders/64a1b2c3d4e5f678901234f/status \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "status": "to roll"
  }'
```

**Response**
```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f678901234f",
    "status": "to roll",
    "type": "sell order",
    "items": [...],
    "updatedAt": "2024-01-15T14:45:00.000Z"
  }
}
```

### Example 2: Invalid Transition (Error)

**Request**
```bash
curl -X PUT http://localhost:5000/api/orders/64a1b2c3d4e5f678901234f/status \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "delivered"
  }'
```

**Response** (Current status is "pending")
```json
{
  "success": false,
  "message": "Cannot transition from pending to delivered"
}
```

### Example 3: Complete Workflow

```bash
# Step 1: pending → to roll (Admin)
PUT /api/orders/64a1b2c3d4e5f678901234f/status
Authorization: Bearer <admin_token>
{ "status": "to roll" }
✅ Success (Admin assigns work)

# Step 2: to roll → rolled (Salesman)
PUT /api/orders/64a1b2c3d4e5f678901234f/status
Authorization: Bearer <salesman_token>
{ "status": "rolled" }
✅ Success (Salesman completes rolling)

# Step 3: rolled → billed (Admin)
PUT /api/orders/64a1b2c3d4e5f678901234f/status
Authorization: Bearer <admin_token>
{ "status": "billed" }
✅ Success (Admin bills customer)

# Step 4: billed → delivered (Admin)
PUT /api/orders/64a1b2c3d4e5f678901234f/status
Authorization: Bearer <admin_token>
{ "status": "delivered" }
✅ Success + WhatsApp notification sent
```

---

## Notifications

### WhatsApp Notification (Delivered Status)

When an order status is updated to `delivered`, the system automatically sends a WhatsApp message to the customer.

#### Trigger Condition
```javascript
if (status === 'delivered' && order.customerName) {
  await sendWhatsAppMessage(
    order.customerName.phone,
    order.customerName.name
  );
}
```

#### Message Template
```
Hello {customerName},

Your order has been delivered successfully!

Date: {currentDate}
Time: {currentTime}

Thank you for your business!
```

#### Environment Configuration
```env
WHATSAPP_API_URL=https://api.whatsapp-provider.com/send
WHATSAPP_API_KEY=your_api_key_here
```

### Push Notification (Order Creation)

When a salesman creates an order, the system sends a push notification to admin.

#### Notification Details
```javascript
await sendPushNotification(
  `New order placed by ${salesmanName}`,
  {
    orderId: order._id,
    salesmanName,
    type: order.type
  }
);
```

#### Environment Configuration
```env
ONESIGNAL_APP_ID=your_onesignal_app_id
ONESIGNAL_REST_API_KEY=your_onesignal_api_key
```

---

## Security & Authorization

### Authentication Requirements

| Endpoint | Authentication | Authorization |
|----------|---------------|---------------|
| `PUT /api/orders/:id/status` | Required | Admin (all) + Salesman (to roll→rolled only) |
| `POST /api/orders` | Required | Admin + Salesman |
| `GET /api/orders` | Required | Admin + Salesman* |
| `GET /api/orders/:id` | Required | Admin + Salesman* |
| `PUT /api/orders/:id` | Required | Admin only |
| `DELETE /api/orders/:id` | Required | Admin only |

\* *Salesmen can access their own orders + all "to roll" orders*

### JWT Token Structure

**Admin Token**
```json
{
  "id": "admin_id",
  "username": "admin",
  "role": "admin",
  "iat": 1642345678,
  "exp": 1642432078
}
```

**Salesman Token**
```json
{
  "id": "salesman_id",
  "username": "salesman_username",
  "role": "salesman",
  "name": "Salesman Name",
  "iat": 1642345678,
  "exp": 1642432078
}
```

### Authorization Flow

```
┌──────────────────┐
│   Client Request │
└────────┬─────────┘
         │
         ▼
┌─────────────────────┐
│ Extract JWT Token   │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Verify Token       │
│  (jwt.verify)       │
└────────┬────────────┘
         │
         ├─────────── Invalid Token → 401 Unauthorized
         │
         ▼
┌─────────────────────┐
│  Check Role         │
│  (decoded.role)     │
└────────┬────────────┘
         │
         ├─────────── Not Admin → 403 Forbidden
         │
         ▼
┌─────────────────────┐
│  Process Request    │
│  Update Status      │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Return Response    │
└─────────────────────┘
```

---

## Frontend Integration

### Admin Dashboard Status Update

**File**: `admin/src/pages/Orders.jsx`

The frontend typically implements a status dropdown or button group:

```javascript
const handleStatusUpdate = async (orderId, newStatus) => {
  try {
    const response = await api.put(`/orders/${orderId}/status`, {
      status: newStatus
    });
    
    if (response.data.success) {
      // Refresh order list
      fetchOrders();
      // Show success message
      showNotification('Status updated successfully', 'success');
    }
  } catch (error) {
    // Handle error
    const message = error.response?.data?.message || 'Failed to update status';
    showNotification(message, 'error');
  }
};
```

### Status Badge Display

```javascript
const getStatusBadgeClass = (status) => {
  const statusClasses = {
    'pending': 'bg-yellow-100 text-yellow-800',
    'to roll': 'bg-blue-100 text-blue-800',
    'rolled': 'bg-purple-100 text-purple-800',
    'billed': 'bg-indigo-100 text-indigo-800',
    'delivered': 'bg-green-100 text-green-800'
  };
  return statusClasses[status] || 'bg-gray-100 text-gray-800';
};

// Usage in JSX
<span className={`px-2 py-1 rounded ${getStatusBadgeClass(order.status)}`}>
  {order.status}
</span>
```

### Available Next Status Function

```javascript
const getNextStatus = (currentStatus) => {
  const transitions = {
    'pending': 'to roll',
    'to roll': 'rolled',
    'rolled': 'billed',
    'billed': 'delivered',
    'delivered': null
  };
  return transitions[currentStatus];
};

// Usage
const nextStatus = getNextStatus(order.status);
if (nextStatus) {
  // Show update button
  <button onClick={() => handleStatusUpdate(order._id, nextStatus)}>
    Update to {nextStatus}
  </button>
}
```

---

## Complete Status Update Workflow

### End-to-End Process

```
┌─────────────────────────────────────────────────────────────────┐
│                     ORDER STATUS LIFECYCLE                       │
└─────────────────────────────────────────────────────────────────┘

1. ORDER CREATION (Salesman)
   ├─ Salesman logs in with credentials
   ├─ Receives JWT token with role='salesman'
   ├─ Creates sell order via POST /api/orders
   └─ Order created with status='pending'
        │
        │ Push notification sent to admin
        ▼

2. STATUS: PENDING
   ├─ Order awaits admin review
   ├─ Admin views order in dashboard
   └─ Admin assigns order for rolling
        │
        ▼

3. STATUS: TO ROLL (Admin updates)
   ├─ Admin: PUT /api/orders/:id/status { status: "to roll" }
   ├─ Backend validates transition (pending → to roll) ✅
   ├─ Status updated in database
   └─ Order now visible to all salesmen
        │
        ▼

4. STATUS: ROLLED (Salesman updates)
   ├─ Salesman views "to roll" orders
   ├─ Salesman completes rolling work
   ├─ Salesman: PUT /api/orders/:id/status { status: "rolled" }
   ├─ Backend validates:
   │    - User is salesman ✅
   │    - Current status is "to roll" ✅
   │    - New status is "rolled" ✅
   ├─ Status updated
   └─ Order processing completed
        │
        ▼

5. STATUS: BILLED (Admin updates)
   ├─ Admin: PUT /api/orders/:id/status { status: "billed" }
   ├─ Backend validates transition (rolled → billed) ✅
   ├─ Status updated
   └─ Customer invoiced
        │
        ▼

6. STATUS: DELIVERED (Admin updates - FINAL)
   ├─ Admin: PUT /api/orders/:id/status { status: "delivered" }
   ├─ Backend validates transition (billed → delivered) ✅
   ├─ Status updated
   ├─ WhatsApp message sent to customer ✉️
   └─ Order lifecycle complete 🎉
```

### Timing Considerations

- **No automatic transitions**: All status changes require manual admin action
- **No time constraints**: Orders can stay in any status indefinitely
- **Audit trail**: `updatedAt` timestamp tracks when status was last changed
- **Irreversible**: Status changes cannot be undone or reversed

---

## Dashboard Statistics

The system provides status-based analytics for admins:

### Endpoint: `GET /api/orders/stats`

**Response**
```json
{
  "success": true,
  "data": {
    "orders": {
      "total": 150,
      "pending": 25,
      "toRoll": 15,
      "rolled": 30,
      "billed": 40,
      "delivered": 40
    },
    "salesmen": 12,
    "customers": 85
  }
}
```

### Dashboard UI Elements

- **Status Cards**: Show count per status
- **Status Filters**: Filter orders by status
- **Status Chart**: Visual representation of order distribution
- **Recent Activity**: Timeline of status changes

---

## Error Handling Best Practices

### Backend Error Responses

```javascript
// Order not found
{
  "success": false,
  "message": "Order not found"
}

// Invalid transition
{
  "success": false,
  "message": "Cannot transition from pending to billed"
}

// Unauthorized
{
  "success": false,
  "message": "Access denied. Admin privileges required."
}

// Server error
{
  "success": false,
  "message": "Internal server error"
}
```

### Frontend Error Handling

```javascript
try {
  await updateOrderStatus(orderId, newStatus);
} catch (error) {
  if (error.response?.status === 400) {
    // Invalid transition
    showError(error.response.data.message);
  } else if (error.response?.status === 401) {
    // Token expired, redirect to login
    redirectToLogin();
  } else if (error.response?.status === 403) {
    // Insufficient permissions
    showError('You do not have permission to perform this action');
  } else {
    // Generic error
    showError('Failed to update status. Please try again.');
  }
}
```

---

## Testing Scenarios

### Unit Tests

```javascript
describe('Order Status Updates', () => {
  test('should update status from pending to to roll', async () => {
    const order = await Order.create({ status: 'pending', /* ... */ });
    const response = await updateOrderStatus(order._id, 'to roll');
    expect(response.status).toBe('to roll');
  });

  test('should reject invalid transition', async () => {
    const order = await Order.create({ status: 'pending', /* ... */ });
    await expect(updateOrderStatus(order._id, 'billed'))
      .rejects.toThrow('Cannot transition from pending to billed');
  });

  test('should send WhatsApp on delivery', async () => {
    const order = await Order.create({ 
      status: 'billed', 
      customerName: customerId 
    });
    await updateOrderStatus(order._id, 'delivered');
    expect(mockWhatsAppService).toHaveBeenCalled();
  });
});
```

---

## Summary

### Key Points

✅ **5 status states**: pending → to roll → rolled → billed → delivered
✅ **Admin-only updates**: Only admins can change order status
✅ **Linear workflow**: Status can only move forward, never backward
✅ **Validation enforced**: Invalid transitions return 400 error
✅ **Automatic notifications**: WhatsApp sent on delivery
✅ **Salesman integration**: Salesmen create orders, admins manage status
✅ **JWT protected**: All endpoints require authentication
✅ **Audit trail**: Timestamps track all changes

### Related Documentation

- **API Documentation**: `/backend/API_DOCUMENTATION.md`
- **API Cheatsheet**: `/backend/API_CHEATSHEET.md`
- **Postman Collection**: `/backend/SRF_API.postman_collection.json`

---

*Last Updated: December 22, 2024*
*Version: 1.0*

