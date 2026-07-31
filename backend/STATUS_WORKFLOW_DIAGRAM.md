# Order Status Update - Visual Workflow Diagrams

## 1. Complete System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                         SRF ORDER MANAGEMENT SYSTEM                   │
└──────────────────────────────────────────────────────────────────────┘

┌─────────────────┐                              ┌─────────────────┐
│                 │                              │                 │
│   SALESMAN      │                              │     ADMIN       │
│   (Mobile App)  │                              │   (Dashboard)   │
│                 │                              │                 │
└────────┬────────┘                              └────────┬────────┘
         │                                                │
         │ Login                                         │ Login
         │ (username/password)                           │ (credentials)
         ▼                                               ▼
    ┌─────────┐                                     ┌─────────┐
    │ JWT     │                                     │ JWT     │
    │ Token   │                                     │ Token   │
    │ role:   │                                     │ role:   │
    │salesman │                                     │ admin   │
    └────┬────┘                                     └────┬────┘
         │                                                │
         │ POST /api/orders                              │
         │ (create sell order)                           │
         ▼                                               │
    ┌─────────────────────┐                             │
    │   Order Created     │                             │
    │  status: pending    │                             │
    │  createdBy: SM_ID   │◄────────────────────────────┘
    │  createdByType:     │     GET /api/orders
    │    salesman         │     (view all orders)
    └──────────┬──────────┘
               │
               │ Push Notification
               ▼
          ┌────────────┐
          │   Admin    │
          │  Notified  │
          └─────┬──────┘
                │
                │ PUT /api/orders/:id/status
                │ { "status": "to roll" }
                ▼
          ┌────────────────────────────────────┐
          │    STATUS UPDATE WORKFLOW          │
          │                                    │
          │  pending → to roll → rolled →     │
          │   (Admin)  (Admin) (Salesman)     │
          │  billed → delivered                │
          │  (Admin)   (Admin)                 │
          │                                    │
          │  ✓ Validation enforced             │
          │  ✓ Linear progression only         │
          │  ✓ Salesman updates to roll→rolled│
          │  ✓ No backward transitions         │
          └─────────────┬──────────────────────┘
                        │
                        │ status = "delivered"
                        ▼
                 ┌──────────────┐
                 │  WhatsApp    │
                 │ Notification │
                 │  to Customer │
                 └──────────────┘
```

## 2. Status Transition Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                    ORDER STATUS LIFECYCLE                         │
└──────────────────────────────────────────────────────────────────┘

   ┌──────────┐
   │ PENDING  │ ← Order created (default status)
   └────┬─────┘
        │
        │ Admin: PUT /api/orders/:id/status
        │        { "status": "to roll" }
        │
        │ Validation: ✓ pending → to roll (allowed)
        │
        ▼
   ┌──────────┐
   │ TO ROLL  │ ← Order assigned, visible to all salesmen
   └────┬─────┘
        │
        │ Salesman: PUT /api/orders/:id/status
        │           { "status": "rolled" }
        │
        │ Validation: ✓ User is salesman
        │             ✓ Current status is "to roll"
        │             ✓ New status is "rolled"
        │
        ▼
   ┌──────────┐
   │  ROLLED  │ ← Salesman completed rolling work
   └────┬─────┘
        │
        │ Admin: PUT /api/orders/:id/status
        │        { "status": "billed" }
        │
        │ Validation: ✓ rolled → billed (allowed)
        │
        ▼
   ┌──────────┐
   │  BILLED  │ ← Invoice generated
   └────┬─────┘
        │
        │ Admin: PUT /api/orders/:id/status
        │        { "status": "delivered" }
        │
        │ Validation: ✓ billed → delivered (allowed)
        │
        ▼
   ┌────────────┐         ┌─────────────────┐
   │ DELIVERED  │────────>│  WhatsApp sent  │
   └────────────┘         │  to customer    │
   (FINAL STATE)          └─────────────────┘
                          
   ❌ No further transitions allowed
```

## 3. Invalid Transition Examples

```
SCENARIO 1: Skipping States ❌

   pending ──────────X──────────> billed
                   (REJECTED)
   
   Error: "Cannot transition from pending to billed"
   
   Correct: pending → to roll → rolled → billed


SCENARIO 2: Backward Movement ❌

   delivered ────────X──────────> billed
                   (REJECTED)
   
   Error: "Cannot transition from delivered to billed"
   
   Reason: Status can only move forward, never backward


SCENARIO 3: From Final State ❌

   delivered ────────X──────────> [any status]
                   (REJECTED)
   
   Error: Cannot transition from delivered (no valid transitions)
   
   Reason: delivered is the final state


SCENARIO 4: Salesman Wrong Transition ❌

   pending ──────────X──────────> to roll
            (Salesman token)
                   (REJECTED)
   
   Error: "Salesmen can only update orders from 'to roll' to 'rolled'"
   
   Reason: Only admin can update pending → to roll
```

## 4. Authorization Flow

```
┌──────────────────────────────────────────────────────────────┐
│               STATUS UPDATE AUTHORIZATION FLOW                │
└──────────────────────────────────────────────────────────────┘

Client Request
│
│ PUT /api/orders/:id/status
│ Authorization: Bearer <token>
│ Body: { "status": "to roll" }
│
▼
┌─────────────────────────────────┐
│  1. Extract JWT Token           │
│     from Authorization header   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  2. Verify Token Signature      │
│     jwt.verify(token, SECRET)   │
└────────────┬────────────────────┘
             │
             ├──────> ❌ Invalid/Expired Token
             │        └─> 401 Unauthorized
             │
             ▼
┌─────────────────────────────────┐
│  3. Check User Role             │
│     decoded.role === 'admin'?   │
└────────────┬────────────────────┘
             │
             ├──────> ❌ role === 'salesman'
             │        └─> 403 Forbidden
             │            "Admin privileges required"
             │
             ▼ ✓ role === 'admin'
┌─────────────────────────────────┐
│  4. Find Order by ID            │
│     Order.findById(params.id)   │
└────────────┬────────────────────┘
             │
             ├──────> ❌ Order not found
             │        └─> 404 Not Found
             │
             ▼ ✓ Order exists
┌─────────────────────────────────┐
│  5. Validate Status Transition  │
│     Check validTransitions map  │
└────────────┬────────────────────┘
             │
             ├──────> ❌ Invalid transition
             │        └─> 400 Bad Request
             │            "Cannot transition from X to Y"
             │
             ▼ ✓ Valid transition
┌─────────────────────────────────┐
│  6. Update Order Status         │
│     order.status = newStatus    │
│     await order.save()          │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│  7. Check if delivered          │
│     status === 'delivered'?     │
└────────────┬────────────────────┘
             │
             ├──────> ✓ Yes
             │        └─> Send WhatsApp to customer
             │
             ▼
┌─────────────────────────────────┐
│  8. Return Success Response     │
│     200 OK with updated order   │
└─────────────────────────────────┘
```

## 5. Role-Based Access Control

```
┌────────────────────────────────────────────────────────────────┐
│                SALESMAN vs ADMIN PERMISSIONS                    │
└────────────────────────────────────────────────────────────────┘

╔════════════════════╦═══════════╦════════════╗
║      ACTION        ║ SALESMAN  ║   ADMIN    ║
╠════════════════════╬═══════════╬════════════╣
║ Create Sell Order  ║     ✅    ║     ✅     ║
║ Create Purchase    ║     ❌    ║     ✅     ║
║ View Own Orders    ║     ✅    ║     ✅     ║
║ View "to roll"     ║     ✅    ║     ✅     ║
║ View All Orders    ║     ❌    ║     ✅     ║
║ Update to roll→    ║     ✅    ║     ✅     ║
║   rolled           ║           ║            ║
║ Update Other       ║     ❌    ║     ✅     ║
║   Statuses         ║           ║            ║
║ Edit Order         ║     ❌    ║     ✅     ║
║ Delete Order       ║     ❌    ║     ✅     ║
║ View Statistics    ║     ❌    ║     ✅     ║
╚════════════════════╩═══════════╩════════════╝


SALESMAN WORKFLOW:
┌──────────┐
│ Salesman │
└────┬─────┘
     │
     │ 1. Login → JWT (role: salesman)
     │
     │ 2. Create Order
     ▼
┌─────────────┐
│   Order     │
│ status:     │
│  pending    │
└─────────────┘
     │
     │ 3. Admin assigns: status → "to roll"
     │
     ▼
┌─────────────┐
│   Order     │
│ status:     │
│  to roll    │
└─────────────┘
     │
     │ 4. Can view this order ✅
     │ 5. Completes rolling work
     │ 6. Updates to "rolled" ✅
     │
     └──> Admin continues workflow


ADMIN WORKFLOW:
┌──────────┐
│  Admin   │
└────┬─────┘
     │
     │ 1. Login → JWT (role: admin)
     │
     │ 2. View all orders
     ▼
┌─────────────┐
│   Order     │
│  (any)      │
└─────────────┘
     │
     │ 3. Full CRUD access ✅
     │    - Update status
     │    - Edit details
     │    - Delete order
     │    - View statistics
     │
     └──> Complete control
```

## 6. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│            ORDER STATUS UPDATE DATA FLOW                         │
└─────────────────────────────────────────────────────────────────┘

Frontend (Admin Dashboard)
│
│  User selects order
│  User clicks "Update Status" → "to roll"
│
▼
┌──────────────────────────────┐
│  API Call (axios/fetch)      │
│                              │
│  PUT /orders/:id/status      │
│  Headers:                    │
│    Authorization: Bearer ... │
│    Content-Type: json        │
│  Body:                       │
│    { status: "to roll" }     │
└────────────┬─────────────────┘
             │
             │ HTTP Request
             ▼
┌──────────────────────────────┐
│  Express.js Backend          │
│                              │
│  Route: PUT /:id/status      │
│  Middleware: authMiddleware  │
│  Controller: updateOrderStat │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│  Auth Middleware             │
│  - Verify JWT                │
│  - Check role === 'admin'    │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│  Controller Logic            │
│  1. Find order by ID         │
│  2. Validate transition      │
│  3. Update status            │
│  4. Save to DB               │
│  5. Populate references      │
│  6. Send notifications       │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│  MongoDB Database            │
│                              │
│  orders.updateOne(           │
│    { _id: orderId },         │
│    { status: "to roll" }     │
│  )                           │
└────────────┬─────────────────┘
             │
             │ Updated document
             ▼
┌──────────────────────────────┐
│  Response Builder            │
│  {                           │
│    success: true,            │
│    message: "Status updated",│
│    data: { ...order }        │
│  }                           │
└────────────┬─────────────────┘
             │
             │ HTTP Response
             ▼
Frontend Receives Response
│
│  Update UI
│  Show success message
│  Refresh order list
│
▼
User sees updated status in table
```

## 7. Notification Flow

```
┌──────────────────────────────────────────────────────────────┐
│              NOTIFICATION SYSTEM WORKFLOW                     │
└──────────────────────────────────────────────────────────────┘

SCENARIO 1: ORDER CREATION
┌──────────┐
│ Salesman │ creates sell order
└────┬─────┘
     │
     │ POST /api/orders
     ▼
┌──────────────┐
│  Order saved │
└──────┬───────┘
       │
       │ Trigger: Order created
       ▼
┌───────────────────────┐
│ sendPushNotification  │
│                       │
│ To: All Admins        │
│ Message: "New order   │
│  placed by {name}"    │
│                       │
│ Data:                 │
│  - orderId            │
│  - salesmanName       │
│  - orderType          │
└───────────┬───────────┘
            │
            │ OneSignal API
            ▼
      ┌──────────┐
      │  Admin   │ receives notification
      │  Device  │ on mobile/desktop
      └──────────┘


SCENARIO 2: ORDER DELIVERED
┌──────────┐
│  Admin   │ updates status to "delivered"
└────┬─────┘
     │
     │ PUT /api/orders/:id/status
     │ { "status": "delivered" }
     ▼
┌───────────────────┐
│ Status validated  │
│ & updated         │
└─────────┬─────────┘
          │
          │ Check: status === 'delivered'
          │        && customerName exists
          ▼
┌──────────────────────┐
│ sendWhatsAppMessage  │
│                      │
│ To: Customer phone   │
│ Message:             │
│  "Hello {name},      │
│   Your order has     │
│   been delivered!"   │
│                      │
│ Date: {date}         │
│ Time: {time}         │
└──────────┬───────────┘
           │
           │ WhatsApp API
           ▼
     ┌────────────┐
     │  Customer  │ receives WhatsApp message
     │   Phone    │
     └────────────┘
```

## 8. Error Handling Flow

```
┌──────────────────────────────────────────────────────────────┐
│                  ERROR HANDLING WORKFLOW                      │
└──────────────────────────────────────────────────────────────┘

API Request
│
│ PUT /api/orders/:id/status
│
▼
┌──────────────────┐
│ Token exists?    │
└────┬──────┬──────┘
     │ NO   │ YES
     ▼      │
   401      │
Unauthorized│
     ▲      ▼
     │ ┌─────────────┐
     │ │ Token valid?│
     │ └──┬──────┬───┘
     │    │ NO   │ YES
     └────┘      │
                 ▼
            ┌──────────┐
            │ Role =   │
            │ admin?   │
            └─┬────┬───┘
              │ NO │ YES
              ▼    │
            403    │
        Forbidden  │
              ▲    ▼
              │ ┌────────────┐
              │ │Order exist?│
              │ └──┬─────┬───┘
              │    │ NO  │ YES
              │    ▼     │
              │   404    │
              │ Not Found│
              │    ▲     ▼
              │    │ ┌────────────────┐
              │    │ │Valid transition│
              │    │ └──┬──────┬──────┘
              │    │    │ NO   │ YES
              │    │    ▼      │
              │    │   400     │
              │    │ Bad Req   │
              │    │    ▲      ▼
              │    │    │  ┌─────────┐
              │    │    │  │ Update  │
              │    │    │  │successful│
              │    │    │  └────┬────┘
              │    │    │       │
              │    │    │       ▼
              │    │    │     200 OK
              │    │    │     Success
              │    │    │
              └────┴────┴──────> Error Response
                                with message
```

## 9. Timeline View

```
┌──────────────────────────────────────────────────────────────┐
│              ORDER LIFECYCLE TIMELINE                         │
└──────────────────────────────────────────────────────────────┘

Day 1, 10:00 AM
│
│  [Salesman] Creates order
│  ↓ POST /api/orders
│  ● ORDER CREATED
│    status: pending
│    createdBy: salesman_123
│
Day 1, 11:30 AM
│
│  [Admin] Reviews order and assigns for rolling
│  ↓ PUT /api/orders/xyz/status {"status":"to roll"}
│  ● STATUS: TO ROLL
│    Order now visible to all salesmen
│
Day 1, 2:00 PM
│
│  [Salesman] Views "to roll" orders, completes rolling
│  ↓ PUT /api/orders/xyz/status {"status":"rolled"}
│  ● STATUS: ROLLED
│    Rolling work completed
│
Day 2, 9:00 AM
│
│  [Admin] Invoice generated
│  ↓ PUT /api/orders/xyz/status {"status":"billed"}
│  ● STATUS: BILLED
│    Customer invoiced
│
Day 2, 4:30 PM
│
│  [Admin] Order delivered
│  ↓ PUT /api/orders/xyz/status {"status":"delivered"}
│  ● STATUS: DELIVERED
│    ↓
│    ├─> WhatsApp sent to customer
│    └─> Order complete
│
▼
```

---

**See Also:**
- Full Documentation: `STATUS_UPDATE_DOCUMENTATION.md`
- Quick Reference: `STATUS_UPDATE_QUICK_REFERENCE.md`

