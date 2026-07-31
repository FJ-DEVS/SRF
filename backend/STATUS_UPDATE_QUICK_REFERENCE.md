# Order Status Update - Quick Reference Guide

## Status Workflow

```
pending → to roll → rolled → billed → delivered
 (Admin)   (Admin)  (Salesman) (Admin)  (Admin)
```

## Status Update Endpoint

```http
PUT /api/orders/:id/status
Authorization: Bearer <admin_or_salesman_token>
Content-Type: application/json

{
  "status": "rolled"
}
```

**Note**: Salesmen can only update "to roll" → "rolled". Admins can update all transitions.

## Valid Transitions

| Current | Next Allowed | Who Can Update |
|---------|-------------|----------------|
| pending | to roll | Admin |
| to roll | rolled | **Salesman** or Admin |
| rolled | billed | Admin |
| billed | delivered | Admin |
| delivered | ❌ None (final) | N/A |

## Who Can Do What?

| Action | Salesman | Admin |
|--------|----------|-------|
| Create orders | ✅ (sell only) | ✅ (all) |
| View own orders | ✅ | ✅ (all) |
| View "to roll" orders | ✅ (all) | ✅ (all) |
| Update "to roll"→"rolled" | ✅ | ✅ |
| Update other statuses | ❌ | ✅ |
| Edit orders | ❌ | ✅ |
| Delete orders | ❌ | ✅ |

## Status Meanings

- **pending**: Order created, awaiting admin review
- **to roll**: Assigned by admin, visible to all salesmen for rolling
- **rolled**: Salesman completed rolling work
- **billed**: Invoice generated for customer
- **delivered**: Order delivered to customer (triggers WhatsApp)

## Notifications

- **Order Created** → Push notification to admin
- **Status = delivered** → WhatsApp message to customer

## Example Requests (cURL)

**Admin assigns order:**
```bash
curl -X PUT http://localhost:5000/api/orders/64a1b2c3d4e5f678901234f/status \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "to roll"}'
```

**Salesman completes rolling:**
```bash
curl -X PUT http://localhost:5000/api/orders/64a1b2c3d4e5f678901234f/status \
  -H "Authorization: Bearer <salesman_token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "rolled"}'
```

## Error Codes

- **400**: Invalid status transition
- **401**: No token or invalid token
- **403**: Insufficient permissions (e.g., salesman trying to update non-"to roll" order)
- **404**: Order not found
- **500**: Server error

## Implementation Files

- **Model**: `backend/models/Order.js`
- **Controller**: `backend/controllers/orderController.js` (updateOrderStatus)
- **Route**: `backend/routes/order.js` (PUT /:id/status)
- **Middleware**: `backend/middleware/auth.js`

## Complete Workflow Example

```javascript
// 1. Salesman creates order
POST /api/orders (salesman_token)
{ type: "sell order", items: [...] }
→ status: "pending"

// 2. Admin assigns for rolling
PUT /api/orders/:id/status (admin_token)
{ "status": "to roll" }  ✅

// 3. Salesman completes rolling
PUT /api/orders/:id/status (salesman_token)
{ "status": "rolled" }  ✅

// 4-5. Admin completes workflow
PUT /api/orders/:id/status (admin_token)
{ "status": "billed" }  ✅

PUT /api/orders/:id/status (admin_token)
{ "status": "delivered" }  ✅
→ WhatsApp sent to customer
```

## Common Errors

### Invalid Transition
```json
{
  "success": false,
  "message": "Cannot transition from pending to billed"
}
```

**Solution**: Update status step-by-step following the workflow

### Salesman Trying Invalid Transition
```json
{
  "success": false,
  "message": "Salesmen can only update orders from \"to roll\" to \"rolled\""
}
```

**Solution**: Salesmen can only update orders with status "to roll" to "rolled". For other transitions, admin access is required.

---

**Full Documentation**: See `STATUS_UPDATE_DOCUMENTATION.md`

