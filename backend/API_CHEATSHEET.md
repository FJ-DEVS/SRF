# SRF Backend API - Quick Reference Cheatsheet

## 🔗 Base URL
```
http://localhost:5000
```

## 🔐 Authentication

### Admin Login
```bash
POST /api/admin/login
Body: { "username": "admin", "password": "admin123" }
Response: { "token": "..." }
```

### Salesman Login
```bash
POST /api/salesman/login
Body: { "username": "john_doe", "password": "password123" }
Response: { "token": "..." }
```

### Use Token
```bash
Authorization: Bearer {token}
```

---

## 👤 Admin Routes

| Endpoint | Method | Auth |
|----------|--------|------|
| `/api/admin/login` | POST | None |
| `/api/admin/verify` | GET | Admin |

---

## 👨‍💼 Salesman Routes

| Endpoint | Method | Auth | Body |
|----------|--------|------|------|
| `/api/salesman/login` | POST | None | `{ username, password }` |
| `/api/salesman` | POST | Admin | `{ name, username, password, phone }` |
| `/api/salesman` | GET | Admin | - |
| `/api/salesman/:id` | GET | Admin | - |
| `/api/salesman/:id` | PUT | Admin | `{ name?, phone?, password? }` |
| `/api/salesman/:id` | DELETE | Admin | - |

**Test Body:**
```json
{
  "name": "John Doe",
  "username": "john_doe",
  "password": "password123",
  "phone": "+1234567890"
}
```

---

## 👥 Customer Routes

| Endpoint | Method | Auth | Body |
|----------|--------|------|------|
| `/api/customers` | POST | Admin | `{ phone, name, gstin?, isBlocked? }` |
| `/api/customers` | GET | Admin | - |
| `/api/customers/:id` | GET | Admin | - |
| `/api/customers/:id` | PUT | Admin | `{ phone?, name?, gstin?, isBlocked? }` |
| `/api/customers/:id` | DELETE | Admin | - |

**Test Body:**
```json
{
  "phone": "+1234567890",
  "name": "ABC Corporation",
  "gstin": "22AAAAA0000A1Z5",
  "isBlocked": false
}
```

---

## 🏭 Vendor Routes

| Endpoint | Method | Auth | Body |
|----------|--------|------|------|
| `/api/vendors` | POST | Admin | `{ phone, name, gstin?, isBlocked? }` |
| `/api/vendors` | GET | Admin | - |
| `/api/vendors/:id` | GET | Admin | - |
| `/api/vendors/:id` | PUT | Admin | `{ phone?, name?, gstin?, isBlocked? }` |
| `/api/vendors/:id` | DELETE | Admin | - |

**Test Body:**
```json
{
  "phone": "+1234567890",
  "name": "Steel Supplier Ltd",
  "gstin": "27AAAAA0000A1Z5",
  "isBlocked": false
}
```

---

## 📦 Item Routes

| Endpoint | Method | Auth | Body |
|----------|--------|------|------|
| `/api/items` | POST | Admin | `{ name, rakNo, price, quantity? }` |
| `/api/items` | GET | Admin | - |
| `/api/items/:id` | GET | Admin | - |
| `/api/items/:id` | PUT | Admin | `{ name?, rakNo?, price?, quantity? }` |
| `/api/items/:id` | DELETE | Admin | - |

**Test Body:**
```json
{
  "name": "Steel Rod 12mm",
  "rakNo": "A1-B2",
  "price": 450.50,
  "quantity": 100
}
```

---

## 🚚 Cargo Routes

| Endpoint | Method | Auth | Body |
|----------|--------|------|------|
| `/api/cargo` | POST | Admin | `{ name }` |
| `/api/cargo` | GET | Admin | - |
| `/api/cargo/:id` | GET | Admin | - |
| `/api/cargo/:id` | PUT | Admin | `{ name }` |
| `/api/cargo/:id` | DELETE | Admin | - |

**Test Body:**
```json
{
  "name": "Express Logistics"
}
```

---

## 📋 Order Routes

| Endpoint | Method | Auth | Body |
|----------|--------|------|------|
| `/api/orders/stats` | GET | Admin | - |
| `/api/orders` | POST | Both* | `{ type, items[], customerName?, cargo?, status? }` |
| `/api/orders` | GET | Both* | - |
| `/api/orders/:id` | GET | Both* | - |
| `/api/orders/:id/status` | PUT | Admin | `{ status }` |
| `/api/orders/:id` | PUT | Admin | `{ type?, items?, customerName?, cargo?, status? }` |
| `/api/orders/:id` | DELETE | Admin | - |

*Both = Admin & Salesman (Salesman sees only own orders)

**Test Body (Sell Order):**
```json
{
  "type": "sell order",
  "items": ["64a1b2c3d4e5f678901234b"],
  "customerName": "64a1b2c3d4e5f6789012347",
  "cargo": "64a1b2c3d4e5f678901234d",
  "status": "pending"
}
```

**Test Body (Purchase Order):**
```json
{
  "type": "purchase order",
  "items": ["64a1b2c3d4e5f678901234b"],
  "status": "pending"
}
```

**Update Status:**
```json
{
  "status": "billed"
}
```

---

## 📊 Order Status Values

```
pending → to roll → rolled → billed → delivered
```

Valid values: `"pending"`, `"to roll"`, `"rolled"`, `"billed"`, `"delivered"`

---

## 🔑 Response Formats

### Success (200/201)
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

### Error (4xx/5xx)
```json
{
  "success": false,
  "message": "Error description"
}
```

---

## 🧪 Quick cURL Examples

### Admin Login
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Create Customer
```bash
curl -X POST http://localhost:5000/api/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"phone":"+1234567890","name":"Test Customer","gstin":"22AAAAA0000A1Z5"}'
```

### Get All Items
```bash
curl -X GET http://localhost:5000/api/items \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Create Order
```bash
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"type":"sell order","items":["ITEM_ID"],"customerName":"CUSTOMER_ID"}'
```

---

## 📝 Field Requirements

### Required Fields

| Resource | Required Fields |
|----------|----------------|
| Salesman | name, username, password, phone |
| Customer | phone, name |
| Vendor | phone, name |
| Item | name, rakNo, price |
| Cargo | name |
| Order | type, createdBy, items[] |

### Optional Fields

| Resource | Optional Fields |
|----------|----------------|
| Salesman | - |
| Customer | gstin, isBlocked |
| Vendor | gstin, isBlocked |
| Item | quantity (default: 1) |
| Cargo | - |
| Order | customerName, cargo, status (default: "pending") |

---

## 🔄 MongoDB ObjectId Examples

Valid format: 24 character hexadecimal string

```
64a1b2c3d4e5f6789012345
507f1f77bcf86cd799439011
5f8d0b1e9c2d4a3f1b2c3d4e
```

---

## ⚡ Quick Test Sequence

```bash
# 1. Login
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Save token from response, then:

# 2. Create Item
curl -X POST http://localhost:5000/api/items \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name":"Test Item","rakNo":"A1","price":100,"quantity":10}'

# 3. Create Customer
curl -X POST http://localhost:5000/api/customers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"phone":"+1234567890","name":"Test Customer"}'

# 4. Create Cargo
curl -X POST http://localhost:5000/api/cargo \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"name":"Express Logistics"}'

# 5. Create Order (use IDs from above responses)
curl -X POST http://localhost:5000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"type":"sell order","items":["ITEM_ID"],"customerName":"CUSTOMER_ID","cargo":"CARGO_ID"}'
```

---

## 🚨 Common HTTP Status Codes

| Code | Meaning | Common Cause |
|------|---------|--------------|
| 200 | OK | Successful GET/PUT/DELETE |
| 201 | Created | Successful POST |
| 400 | Bad Request | Validation error, missing fields |
| 401 | Unauthorized | No token or invalid token |
| 403 | Forbidden | Valid token but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 500 | Server Error | Server-side issue |

---

## 💾 Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017/srf
JWT_SECRET=your_secret_key_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
PORT=5000
```

---

## 🎯 Postman Collection

Import `SRF_API.postman_collection.json` into Postman for automatic:
- Token management
- ID variable storage
- Request templates
- Auto-populated responses

---

**Last Updated:** Dec 2024  
**API Version:** 1.0  
**Base URL:** http://localhost:5000

