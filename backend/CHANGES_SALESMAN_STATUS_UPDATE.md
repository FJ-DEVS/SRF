# Changes Made to Salesman Status Update System

## Date: December 22, 2024

## Summary of Changes

The order status update system has been modified to allow **salesmen to update orders from "to roll" to "rolled"**. This reflects the real workflow where salesmen are responsible for completing the rolling work.

---

## Changes Made

### 1. **Backend Route** (`backend/routes/order.js`)

**Changed:**
- Status update endpoint now uses `anyAuthMiddleware` instead of `authMiddleware`
- This allows both admin AND salesman to access the status update endpoint

```javascript
// OLD
router.put('/:id/status', authMiddleware, orderController.updateOrderStatus);

// NEW
router.put('/:id/status', anyAuthMiddleware, orderController.updateOrderStatus);
```

---

### 2. **Backend Controller** (`backend/controllers/orderController.js`)

#### A. Added Salesman Authorization Check

Added logic to ensure salesmen can ONLY update "to roll" → "rolled":

```javascript
// Salesman can only update "to roll" → "rolled"
if (req.user.role === 'salesman') {
  if (order.status !== 'to roll' || status !== 'rolled') {
    return res.status(403).json({ 
      success: false, 
      message: 'Salesmen can only update orders from "to roll" to "rolled"' 
    });
  }
}
```

#### B. Modified Order Visibility for Salesmen

Changed `getAllOrders` function to allow salesmen to see "to roll" orders:

```javascript
// OLD - Salesmen only see their own orders
if (req.user.role === 'salesman') {
  query.createdBy = req.user.id;
}

// NEW - Salesmen see their own orders OR "to roll" orders
if (req.user.role === 'salesman') {
  query.$or = [
    { createdBy: req.user.id },
    { status: 'to roll' }
  ];
}
```

---

### 3. **Documentation Updates**

All three documentation files have been updated:

#### A. `STATUS_UPDATE_DOCUMENTATION.md`
- Updated overview to reflect salesman's role in rolling
- Modified permission tables
- Updated workflow diagrams
- Added salesman authorization examples
- Updated API endpoint descriptions

#### B. `STATUS_UPDATE_QUICK_REFERENCE.md`
- Updated status workflow diagram to show role for each transition
- Modified "Who Can Do What" table
- Added salesman-specific examples
- Updated error handling section

#### C. `STATUS_WORKFLOW_DIAGRAM.md`
- Updated all visual diagrams
- Added salesman role annotations
- Modified authorization flow diagrams
- Updated timeline examples

---

## New Workflow

### Correct Order Status Flow:

```
1. Salesman creates order → status: "pending"
   ↓
2. Admin reviews and assigns → status: "to roll" (Admin updates)
   ↓
3. Salesman views "to roll" orders
   ↓
4. Salesman completes rolling work → status: "rolled" (Salesman updates)
   ↓
5. Admin bills customer → status: "billed" (Admin updates)
   ↓
6. Admin delivers order → status: "delivered" (Admin updates)
   └─> WhatsApp notification sent to customer
```

---

## Permissions Matrix (Updated)

| Action | Salesman | Admin |
|--------|----------|-------|
| Create orders | ✅ (sell only) | ✅ (all types) |
| View own orders | ✅ | ✅ (all orders) |
| View "to roll" orders | ✅ (all) | ✅ (all orders) |
| View all orders | ❌ | ✅ |
| Update pending→to roll | ❌ | ✅ |
| Update **to roll→rolled** | ✅ | ✅ |
| Update rolled→billed | ❌ | ✅ |
| Update billed→delivered | ❌ | ✅ |
| Edit order details | ❌ | ✅ |
| Delete orders | ❌ | ✅ |

---

## API Examples

### Salesman Updates Order to "Rolled"

**Request:**
```bash
PUT /api/orders/64a1b2c3d4e5f678901234f/status
Authorization: Bearer <salesman_jwt_token>
Content-Type: application/json

{
  "status": "rolled"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Order status updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f678901234f",
    "status": "rolled",
    ...
  }
}
```

**Response (Error - 403) - Wrong Status:**
```json
{
  "success": false,
  "message": "Salesmen can only update orders from \"to roll\" to \"rolled\""
}
```

---

## Frontend Impact

### What Needs to be Updated in Frontend:

1. **Salesman Dashboard/App:**
   - Add view to show "to roll" orders
   - Add button/action to update order to "rolled"
   - Show success/error messages

2. **Admin Dashboard:**
   - No changes required (admins can still update all statuses)

---

## Testing Checklist

### ✅ Backend Tests to Verify:

- [ ] Salesman can view "to roll" orders (not created by them)
- [ ] Salesman can update "to roll" → "rolled"
- [ ] Salesman CANNOT update "pending" → "to roll"
- [ ] Salesman CANNOT update "rolled" → "billed"
- [ ] Salesman CANNOT update "billed" → "delivered"
- [ ] Salesman can still view their own orders
- [ ] Admin can still update all status transitions
- [ ] Invalid transitions still return 400 error
- [ ] Unauthorized requests return 401 error
- [ ] Salesman invalid transitions return 403 error

### ✅ Frontend Tests to Verify:

- [ ] Salesman can see "to roll" orders in their view
- [ ] Salesman can click button to mark order as "rolled"
- [ ] Success message shows when status updated
- [ ] Error message shows if transition invalid
- [ ] Admin dashboard still works for all status updates

---

## Database Changes

**No database schema changes required.** All changes are in application logic only.

---

## API Endpoints Changed

| Endpoint | Old Auth | New Auth | Notes |
|----------|----------|----------|-------|
| `PUT /api/orders/:id/status` | Admin only | Admin + Salesman* | *Salesman restricted to "to roll" → "rolled" |
| `GET /api/orders` | Admin + Salesman | Admin + Salesman | Salesmen now see "to roll" orders too |

All other endpoints remain unchanged.

---

## Rollback Instructions

If you need to revert these changes:

1. **Restore route:**
   ```javascript
   router.put('/:id/status', authMiddleware, orderController.updateOrderStatus);
   ```

2. **Remove salesman check in controller:**
   - Remove the `if (req.user.role === 'salesman')` block from `updateOrderStatus`

3. **Restore order visibility:**
   ```javascript
   if (req.user.role === 'salesman') {
     query.createdBy = req.user.id;
   }
   ```

---

## Files Modified

### Backend:
- `backend/routes/order.js`
- `backend/controllers/orderController.js`

### Documentation:
- `backend/STATUS_UPDATE_DOCUMENTATION.md`
- `backend/STATUS_UPDATE_QUICK_REFERENCE.md`
- `backend/STATUS_WORKFLOW_DIAGRAM.md`
- `backend/CHANGES_SALESMAN_STATUS_UPDATE.md` (this file - new)

---

## Questions or Issues?

If you encounter any issues with these changes:
1. Check the error message - it will tell you exactly what's wrong
2. Verify the JWT token has the correct role (`salesman` or `admin`)
3. Confirm the order status is "to roll" before trying to update to "rolled"
4. Refer to the documentation files for detailed examples

---

**Change Author**: AI Assistant  
**Date**: December 22, 2024  
**Status**: ✅ Complete


