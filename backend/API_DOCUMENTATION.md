# Backend API Documentation

## Base URL
```
http://localhost:{PORT}
```

## Table of Contents
1. [Admin Authentication](#admin-authentication)
2. [Salesman Management](#salesman-management)
3. [Salesman read-only API](#salesman-read-only-api)
4. [Customer Management](#customer-management)
5. [Vendor Management](#vendor-management)
6. [Item Management](#item-management)
7. [Cargo Management](#cargo-management)
8. [Order Management](#order-management)
9. [Authentication](#authentication)
10. [Error Responses](#error-responses)
11. [Testing with Postman/Thunder Client](#testing-with-postmanthunder-client)
12. [Notes](#notes)
13. [Quick Reference](#quick-reference)

---

## Admin Authentication

### 1. Admin Login
**POST** `/api/admin/login`

**Description:** Admin login to get JWT token

**Authentication:** None (Public)

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Admin login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "admin",
    "role": "admin"
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

### 2. Verify Token
**GET** `/api/admin/verify`

**Description:** Verify if JWT token is valid

**Authentication:** Bearer Token

**Headers:**
```
Authorization: Bearer {token}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Token is valid",
  "user": {
    "username": "admin",
    "role": "admin",
    "id": "admin",
    "iat": 1703001234,
    "exp": 1703087634
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Invalid token"
}
```

---

## Salesman Management

### 1. Salesman Login
**POST** `/api/salesman/login`

**Description:** Salesman login to get JWT token

**Authentication:** None (Public)

**Request Body:**
```json
{
  "username": "john_doe",
  "password": "password123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64a1b2c3d4e5f6789012345",
    "username": "john_doe",
    "name": "John Doe",
    "phone": "+1234567890",
    "role": "salesman"
  }
}
```

### 2. Create Salesman
**POST** `/api/salesman`

**Description:** Create a new salesman (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Request Body:**
```json
{
  "name": "John Doe",
  "username": "john_doe",
  "password": "password123",
  "phone": "+1234567890"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Salesman created successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6789012345",
    "name": "John Doe",
    "username": "john_doe",
    "phone": "+1234567890",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Get All Salesmen
**GET** `/api/salesman`

**Description:** Paginated list of salesmen (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Query parameters:** `search` (name, username, or phone), `page` (default `1`), `limit` (default `10`).

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789012345",
      "name": "John Doe",
      "username": "john_doe",
      "phone": "+1234567890",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "pages": 1
  }
}
```

### 4. Get Single Salesman
**GET** `/api/salesman/:id`

**Description:** Get details of a specific salesman (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/salesman/64a1b2c3d4e5f6789012345`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789012345",
    "name": "John Doe",
    "username": "john_doe",
    "phone": "+1234567890",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 5. Update Salesman
**PUT** `/api/salesman/:id`

**Description:** Update salesman details (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/salesman/64a1b2c3d4e5f6789012345`

**Request Body:**
```json
{
  "name": "John Updated",
  "phone": "+9876543210"
}
```

**Note:** You can update any field except username. Password will be automatically hashed if provided.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Salesman updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6789012345",
    "name": "John Updated",
    "username": "john_doe",
    "phone": "+9876543210",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### 6. Delete Salesman
**DELETE** `/api/salesman/:id`

**Description:** Delete a salesman (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/salesman/64a1b2c3d4e5f6789012345`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Salesman deleted successfully"
}
```

---

## Salesman read-only API

Read-only endpoints for salesmen to load catalog data and orders using a **salesman JWT**. Requests must send:

```
Authorization: Bearer {salesman_token}
```

If the token is missing, invalid, expired, or belongs to an **admin** (or any non-salesman role), the server returns `401` / `403` as appropriate.

### Items

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/items/salesman/list` | Paginated list; fields `name`, `rakNo`, `price`, `quantity` (plus `_id`); sorted by `name` |
| GET | `/api/items/salesman/:id` | Single item by ID; same fields |

**Query parameters (list):** `search` (matches `name` or `rakNo`, case-insensitive), `page` (default `1`), `limit` (default `10`).

### Customers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/customers/salesman/list` | Paginated list; fields `phone`, `name`, `gstin` (plus `_id`); sorted by `name` |
| GET | `/api/customers/salesman/:id` | Single customer; same fields |

**Query parameters (list):** `search` (name, phone, or GSTIN), `page`, `limit`.

### Vendors

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vendors/salesman/list` | Same pattern as customers |
| GET | `/api/vendors/salesman/:id` | Single vendor; `phone`, `name`, `gstin` |

**Query parameters (list):** `search`, `page`, `limit`.

### Cargo

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cargo/salesman/list` | Paginated list; field `name` (plus `_id`); sorted by `name` |
| GET | `/api/cargo/salesman/:id` | Single cargo; `name` |

**Query parameters (list):** `search` (cargo name), `page`, `limit`.

### Orders (salesman-only routes)

These use the same controller logic as `GET /api/orders` and `GET /api/orders/:id`, but the route accepts **only** a valid salesman token (not admin).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/orders/salesman/list` | Orders visible to this salesman |
| GET | `/api/orders/salesman/:id` | One order, if visible |

**Salesman visibility:** orders **created by** the authenticated salesman, **or** any order with status **`to roll`** (queue shared on the floor). **Admins** calling `GET /api/orders` see **all** orders.

**Query parameters (list):** `status`, `type`, `month`, `year`, `search`, `page`, `limit` (same as admin list).

### Typical pagination response

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "total": 42,
    "page": 1,
    "pages": 5
  }
}
```

---

## Customer Management

### 1. Create Customer
**POST** `/api/customers`

**Description:** Create a new customer (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Request Body:**
```json
{
  "phone": "+1234567890",
  "name": "ABC Corporation",
  "gstin": "22AAAAA0000A1Z5",
  "isBlocked": false
}
```

**Note:** `gstin` and `isBlocked` are optional. `isBlocked` defaults to `false`.

**Success Response (201):**
```json
{
  "success": true,
  "message": "Customer created successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6789012347",
    "phone": "+1234567890",
    "name": "ABC Corporation",
    "gstin": "22AAAAA0000A1Z5",
    "isBlocked": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Get All Customers
**GET** `/api/customers`

**Description:** Get paginated list of customers (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Query parameters:** `search` (matches `name`, `phone`, or `gstin`), `isBlocked` (`true` / `false`), `page` (default `1`), `limit` (default `10`).

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789012347",
      "phone": "+1234567890",
      "name": "ABC Corporation",
      "gstin": "22AAAAA0000A1Z5",
      "isBlocked": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "pages": 1
  }
}
```

### 3. Get Single Customer
**GET** `/api/customers/:id`

**Description:** Get details of a specific customer (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/customers/64a1b2c3d4e5f6789012347`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789012347",
    "phone": "+1234567890",
    "name": "ABC Corporation",
    "gstin": "22AAAAA0000A1Z5",
    "isBlocked": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. Update Customer
**PUT** `/api/customers/:id`

**Description:** Update customer details (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/customers/64a1b2c3d4e5f6789012347`

**Request Body:**
```json
{
  "name": "ABC Corporation Updated",
  "phone": "+1111111111",
  "gstin": "22AAAAA0000A1Z9",
  "isBlocked": true
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Customer updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6789012347",
    "phone": "+1111111111",
    "name": "ABC Corporation Updated",
    "gstin": "22AAAAA0000A1Z9",
    "isBlocked": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### 5. Delete Customer
**DELETE** `/api/customers/:id`

**Description:** Delete a customer (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/customers/64a1b2c3d4e5f6789012347`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Customer deleted successfully"
}
```

---

## Vendor Management

### 1. Create Vendor
**POST** `/api/vendors`

**Description:** Create a new vendor (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Request Body:**
```json
{
  "phone": "+1234567890",
  "name": "Steel Supplier Ltd",
  "gstin": "27AAAAA0000A1Z5",
  "isBlocked": false
}
```

**Note:** `gstin` and `isBlocked` are optional. `isBlocked` defaults to `false`.

**Success Response (201):**
```json
{
  "success": true,
  "message": "Vendor created successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6789012349",
    "phone": "+1234567890",
    "name": "Steel Supplier Ltd",
    "gstin": "27AAAAA0000A1Z5",
    "isBlocked": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Get All Vendors
**GET** `/api/vendors`

**Description:** Get paginated list of vendors (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Query parameters:** `search`, `isBlocked`, `page`, `limit` (same pattern as customers).

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f6789012349",
      "phone": "+1234567890",
      "name": "Steel Supplier Ltd",
      "gstin": "27AAAAA0000A1Z5",
      "isBlocked": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "pages": 1
  }
}
```

### 3. Get Single Vendor
**GET** `/api/vendors/:id`

**Description:** Get details of a specific vendor (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/vendors/64a1b2c3d4e5f6789012349`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f6789012349",
    "phone": "+1234567890",
    "name": "Steel Supplier Ltd",
    "gstin": "27AAAAA0000A1Z5",
    "isBlocked": false,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. Update Vendor
**PUT** `/api/vendors/:id`

**Description:** Update vendor details (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/vendors/64a1b2c3d4e5f6789012349`

**Request Body:**
```json
{
  "name": "Steel Supplier Updated",
  "phone": "+1111111111",
  "gstin": "27AAAAA0000A1Z9",
  "isBlocked": true
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Vendor updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f6789012349",
    "phone": "+1111111111",
    "name": "Steel Supplier Updated",
    "gstin": "27AAAAA0000A1Z9",
    "isBlocked": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### 5. Delete Vendor
**DELETE** `/api/vendors/:id`

**Description:** Delete a vendor (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/vendors/64a1b2c3d4e5f6789012349`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Vendor deleted successfully"
}
```

---

## Item Management

### 1. Create Item
**POST** `/api/items`

**Description:** Create a new item (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Request Body:**
```json
{
  "name": "Steel Rod 12mm",
  "rakNo": "A1-B2",
  "price": 450.50,
  "quantity": 100
}
```

**Note:** `quantity` is optional and defaults to 1.

**Success Response (201):**
```json
{
  "success": true,
  "message": "Item created successfully",
  "data": {
    "_id": "64a1b2c3d4e5f678901234b",
    "name": "Steel Rod 12mm",
    "rakNo": "A1-B2",
    "price": 450.50,
    "quantity": 100,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Get All Items
**GET** `/api/items`

**Description:** Get paginated list of items (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Query parameters:** `search` (`name` or `rakNo`), `page`, `limit`.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f678901234b",
      "name": "Steel Rod 12mm",
      "rakNo": "A1-B2",
      "price": 450.50,
      "quantity": 100,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "pages": 1
  }
}
```

### 3. Get Single Item
**GET** `/api/items/:id`

**Description:** Get details of a specific item (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/items/64a1b2c3d4e5f678901234b`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f678901234b",
    "name": "Steel Rod 12mm",
    "rakNo": "A1-B2",
    "price": 450.50,
    "quantity": 100,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. Update Item
**PUT** `/api/items/:id`

**Description:** Update item details (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/items/64a1b2c3d4e5f678901234b`

**Request Body:**
```json
{
  "name": "Steel Rod 12mm Updated",
  "rakNo": "A1-B3",
  "price": 475.00,
  "quantity": 150
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Item updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f678901234b",
    "name": "Steel Rod 12mm Updated",
    "rakNo": "A1-B3",
    "price": 475.00,
    "quantity": 150,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### 5. Delete Item
**DELETE** `/api/items/:id`

**Description:** Delete an item (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/items/64a1b2c3d4e5f678901234b`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Item deleted successfully"
}
```

---

## Cargo Management

### 1. Create Cargo
**POST** `/api/cargo`

**Description:** Create a new cargo (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Request Body:**
```json
{
  "name": "Express Logistics"
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Cargo created successfully",
  "data": {
    "_id": "64a1b2c3d4e5f678901234d",
    "name": "Express Logistics",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Get All Cargo
**GET** `/api/cargo`

**Description:** Get paginated list of cargo companies (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Query parameters:** `search` (cargo `name`), `page`, `limit`.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f678901234d",
      "name": "Express Logistics",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "pages": 1
  }
}
```

### 3. Get Single Cargo
**GET** `/api/cargo/:id`

**Description:** Get details of a specific cargo company (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/cargo/64a1b2c3d4e5f678901234d`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f678901234d",
    "name": "Express Logistics",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. Update Cargo
**PUT** `/api/cargo/:id`

**Description:** Update cargo company details (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/cargo/64a1b2c3d4e5f678901234d`

**Request Body:**
```json
{
  "name": "Express Logistics Updated"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Cargo updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f678901234d",
    "name": "Express Logistics Updated",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### 5. Delete Cargo
**DELETE** `/api/cargo/:id`

**Description:** Delete a cargo company (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/cargo/64a1b2c3d4e5f678901234d`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Cargo deleted successfully"
}
```

---

## Order Management

### 1. Get Dashboard Statistics
**GET** `/api/orders/stats`

**Description:** Aggregated dashboard metrics (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "orders": {
      "total": 150,
      "pending": 25,
      "toRoll": 10,
      "rolled": 8,
      "billed": 7,
      "delivered": 100
    },
    "salesmen": 5,
    "customers": 42,
    "trends": [
      {
        "month": "Nov",
        "orders": 12,
        "delivered": 9
      }
    ]
  }
}
```

**Note:** `trends` contains the last six calendar months of counts (`orders`, `delivered`) for charting.

### 2. Create Order
**POST** `/api/orders`

**Description:** Create a new order. **Admin** may create `sell order` or `purchase order`. **Salesman** may create **`sell order` only** (returns `403` for `purchase order`).

**Authentication:** Bearer Token (Admin or Salesman)

**Headers:**
```
Authorization: Bearer {token}
```

**Request Body (Sell Order — correct `items` shape):**
```json
{
  "type": "sell order",
  "items": [
    { "item": "64a1b2c3d4e5f678901234b", "quantity": 2 },
    { "item": "64a1b2c3d4e5f678901234c", "quantity": 1 }
  ],
  "customerName": "64a1b2c3d4e5f6789012347",
  "cargo": "64a1b2c3d4e5f678901234d"
}
```

**Request Body (Purchase Order — admin only):**
```json
{
  "type": "purchase order",
  "items": [
    { "item": "64a1b2c3d4e5f678901234b", "quantity": 10 }
  ],
  "customerName": "64a1b2c3d4e5f6789012347",
  "cargo": "64a1b2c3d4e5f678901234d"
}
```

**Note:** 
- Each element of `items` **must** be an object with `item` (MongoDB ObjectId string) and `quantity` (integer ≥ 1). Arrays of bare item IDs are **not** accepted.
- `createdBy` / `createdByType` are set from the JWT (`admin` → literal `"Admin"` for `createdBy`; `salesman` → salesman `_id`).
- **`status`** is **not** taken from the body; new orders are saved with `status: "pending"`.
- **Sell orders:** stock is decremented per line item; insufficient stock returns `400`.
- **Purchase orders:** stock is incremented (admin only in practice).
- **Blocked customers** cannot be used (`400` if `customerName` points to a blocked customer).
- `customerName` and `cargo` are optional in the schema but typically needed for sell orders.

**Success Response (201):**
```json
{
  "success": true,
  "message": "Order created successfully",
  "data": {
    "_id": "64a1b2c3d4e5f678901234f",
    "type": "sell order",
    "items": [
      {
        "item": { "_id": "64a1b2c3d4e5f678901234b", "name": "Steel Rod 12mm", "rakNo": "A1-B2", "price": 450.50 },
        "quantity": 2
      }
    ],
    "customerName": { "_id": "64a1b2c3d4e5f6789012347", "name": "ABC Corporation", "phone": "+1234567890" },
    "cargo": { "_id": "64a1b2c3d4e5f678901234d", "name": "Express Logistics" },
    "status": "pending",
    "createdByType": "salesman",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. Get All Orders
**GET** `/api/orders`

**Description:** Paginated order list. **Admin:** all orders. **Salesman:** only orders where **`createdBy`** is that salesman **or** **`status`** is **`to roll`**.

**Authentication:** Bearer Token (Admin or Salesman)

**Headers:**
```
Authorization: Bearer {token}
```

**Query parameters:** `status`, `type`, `month` (1–12, use with `year`), `year`, `search`, `page` (default `1`), `limit` (default `10`).

**Note:** Equivalent salesman-only URLs: `GET /api/orders/salesman/list` (same query parameters and visibility rules; **salesman token required**).

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "64a1b2c3d4e5f678901234f",
      "type": "sell order",
      "createdByType": "salesman",
      "items": [
        {
          "item": {
            "_id": "64a1b2c3d4e5f678901234b",
            "name": "Steel Rod 12mm",
            "rakNo": "A1-B2",
            "price": 450.50,
            "quantity": 100
          },
          "quantity": 2
        }
      ],
      "customerName": {
        "_id": "64a1b2c3d4e5f6789012347",
        "name": "ABC Corporation",
        "phone": "+1234567890",
        "gstin": "22AAAAA0000A1Z5"
      },
      "cargo": {
        "_id": "64a1b2c3d4e5f678901234d",
        "name": "Express Logistics"
      },
      "status": "pending",
      "createdBy": {
        "_id": "64a1b2c3d4e5f6789012345",
        "name": "John Doe",
        "username": "john_doe"
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "pages": 1
  }
}
```

`createdBy` for admin-created orders remains the string `"Admin"` (not populated as a document).

### 4. Get Single Order
**GET** `/api/orders/:id`

**Description:** Get one order by ID.

**Authentication:** Bearer Token (Admin or Salesman)

**Headers:**
```
Authorization: Bearer {token}
```

**Example:** `/api/orders/64a1b2c3d4e5f678901234f`

**Note:** **Salesman** may load the order only if they **created** it **or** its **`status`** is **`to roll`**. Otherwise `403`. **Admin:** any order. Equivalent salesman-only URL: `GET /api/orders/salesman/:id`.

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "64a1b2c3d4e5f678901234f",
    "type": "sell order",
    "items": [
      {
        "item": {
          "_id": "64a1b2c3d4e5f678901234b",
          "name": "Steel Rod 12mm",
          "rakNo": "A1-B2",
          "price": 450.50,
          "quantity": 100
        },
        "quantity": 2
      }
    ],
    "customerName": {
      "_id": "64a1b2c3d4e5f6789012347",
      "name": "ABC Corporation",
      "phone": "+1234567890",
      "gstin": "22AAAAA0000A1Z5"
    },
    "cargo": {
      "_id": "64a1b2c3d4e5f678901234d",
      "name": "Express Logistics"
    },
    "status": "pending",
    "createdBy": {
      "_id": "64a1b2c3d4e5f6789012345",
      "name": "John Doe",
      "username": "john_doe"
    },
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 5. Update Order Status
**PUT** `/api/orders/:id/status`

**Description:** Move an order forward in the workflow. **Admin** may apply any **allowed** transition. **Salesman** may **only** move an order from **`to roll`** → **`rolled`** (any other target returns `403`).

**Authentication:** Bearer Token (Admin or Salesman)

**Headers:**
```
Authorization: Bearer {admin_token_or_salesman_token}
```

**Example:** `/api/orders/64a1b2c3d4e5f678901234f/status`

**Request Body:**
```json
{
  "status": "to roll"
}
```

**Allowed transitions (current status → next status):**
- `pending` → `to roll`
- `to roll` → `rolled`
- `rolled` → `billed`
- `billed` → `delivered`

Requests that skip steps or go backwards return `400` with a transition error message.

**Note:** When status becomes `delivered`, the API may trigger a WhatsApp notification if credentials and customer phone are configured.

**Success Response (200):** Populated `data` order (items, customer, cargo, and `createdBy` when applicable), same general shape as get-order responses.

### 6. Update Order
**PUT** `/api/orders/:id`

**Description:** Update complete order details (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/orders/64a1b2c3d4e5f678901234f`

**Request Body:** All fields optional; only include fields to change.

```json
{
  "items": [
    { "item": "64a1b2c3d4e5f678901234b", "quantity": 3 },
    { "item": "64a1b2c3d4e5f678901234c", "quantity": 1 }
  ],
  "customerName": "64a1b2c3d4e5f6789012347",
  "cargo": "64a1b2c3d4e5f678901234d",
  "status": "rolled"
}
```

Each `items[]` entry must use `item` + `quantity` in the same format as create order.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Order updated successfully",
  "data": {
    "_id": "64a1b2c3d4e5f678901234f",
    "type": "sell order",
    "items": [
      {
        "item": {
          "_id": "64a1b2c3d4e5f678901234b",
          "name": "Steel Rod 12mm",
          "rakNo": "A1-B2",
          "price": 450.50,
          "quantity": 100
        },
        "quantity": 3
      }
    ],
    "customerName": "64a1b2c3d4e5f6789012347",
    "cargo": "64a1b2c3d4e5f678901234d",
    "status": "rolled",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### 7. Delete Order
**DELETE** `/api/orders/:id`

**Description:** Delete an order (Admin only)

**Authentication:** Bearer Token (Admin)

**Headers:**
```
Authorization: Bearer {admin_token}
```

**Example:** `/api/orders/64a1b2c3d4e5f678901234f`

**Success Response (200):**
```json
{
  "success": true,
  "message": "Order deleted successfully"
}
```

---

## Authentication

### Token Usage

All authenticated endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Token Expiration

- Admin tokens: Valid for 24 hours
- Salesman tokens: Valid for 24 hours

### Getting Tokens

- **Admin Token:** Use `/api/admin/login` endpoint
- **Salesman Token:** Use `/api/salesman/login` endpoint

### Token Payload Structure

**Admin Token:**
```json
{
  "username": "admin",
  "role": "admin",
  "id": "admin",
  "iat": 1703001234,
  "exp": 1703087634
}
```

**Salesman Token:**
```json
{
  "id": "64a1b2c3d4e5f6789012345",
  "username": "john_doe",
  "name": "John Doe",
  "role": "salesman",
  "iat": 1703001234,
  "exp": 1703087634
}
```

---

## Error Responses

### Common Error Codes

**400 Bad Request**
```json
{
  "success": false,
  "message": "Validation error message"
}
```

**401 Unauthorized**
```json
{
  "success": false,
  "message": "Access denied. No token provided."
}
```

**403 Forbidden**
```json
{
  "success": false,
  "message": "Access denied."
}
```

**404 Not Found**
```json
{
  "success": false,
  "message": "Resource not found"
}
```

**500 Internal Server Error**
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## Testing with Postman/Thunder Client

### 1. Admin Login and Get Token
```
POST http://localhost:5000/api/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### 2. Use Token in Subsequent Requests
```
GET http://localhost:5000/api/customers
Authorization: Bearer YOUR_TOKEN_HERE
```

### 3. Create a Customer
```
POST http://localhost:5000/api/customers
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json

{
  "phone": "+1234567890",
  "name": "Test Customer",
  "gstin": "22AAAAA0000A1Z5"
}
```

### 4. Salesman Login
```
POST http://localhost:5000/api/salesman/login
Content-Type: application/json

{
  "username": "salesman_username",
  "password": "salesman_password"
}
```

### 5. Create Order as Salesman
```
POST http://localhost:5000/api/orders
Authorization: Bearer YOUR_SALESMAN_TOKEN
Content-Type: application/json

{
  "type": "sell order",
  "items": [
    { "item": "ITEM_ID_HERE", "quantity": 1 }
  ],
  "customerName": "CUSTOMER_ID_HERE",
  "cargo": "CARGO_ID_HERE"
}
```

### 6. Salesman catalog and orders (read-only checks)
```
GET http://localhost:5000/api/items/salesman/list
Authorization: Bearer YOUR_SALESMAN_TOKEN

GET http://localhost:5000/api/customers/salesman/list
Authorization: Bearer YOUR_SALESMAN_TOKEN

GET http://localhost:5000/api/orders/salesman/list
Authorization: Bearer YOUR_SALESMAN_TOKEN
```

---

## Notes

1. **Environment Variables Required:**
   - `MONGODB_URI` - MongoDB connection string
   - `JWT_SECRET` - Secret key for JWT signing
   - `ADMIN_USERNAME` - Admin username
   - `ADMIN_PASSWORD` - Admin password (can be plain text or bcrypt hash)
   - `PORT` - Server port

2. **Password Hashing:**
   - Salesman passwords are automatically hashed before saving
   - Admin password can be plain text or bcrypt hash in .env file

3. **Access Control:**
   - **Admin:** Full CRUD on customers, vendors, items, cargo, salesmen; all orders; dashboard stats.
   - **Salesman:** Login; read-only catalog routes (`/api/items/salesman/...`, `/api/customers/salesman/...`, `/api/vendors/salesman/...`, `/api/cargo/salesman/...`); create orders (`POST /api/orders`, **sell orders only**); list/get orders (`GET /api/orders` or `GET /api/orders/salesman/...`) with visibility rules; **status** update only **`to roll` → `rolled`** on `PUT /api/orders/:id/status`.
   - **Public:** `POST /api/admin/login`, `POST /api/salesman/login`

4. **Data Population:**
   - Order endpoints automatically populate referenced data (items, customer, cargo, createdBy) in responses

5. **ObjectId Format:**
   - All IDs are MongoDB ObjectIds (24 character hex string)
   - Example: `64a1b2c3d4e5f6789012345`

---

## Quick Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/admin/login` | POST | None | Admin login |
| `/api/admin/verify` | GET | Admin | Verify token |
| `/api/salesman/login` | POST | None | Salesman login |
| `/api/salesman` | POST | Admin | Create salesman |
| `/api/salesman` | GET | Admin | Get all salesmen |
| `/api/salesman/:id` | GET | Admin | Get one salesman |
| `/api/salesman/:id` | PUT | Admin | Update salesman |
| `/api/salesman/:id` | DELETE | Admin | Delete salesman |
| `/api/customers` | POST | Admin | Create customer |
| `/api/customers` | GET | Admin | Get all customers |
| `/api/customers/:id` | GET | Admin | Get one customer |
| `/api/customers/:id` | PUT | Admin | Update customer |
| `/api/customers/:id` | DELETE | Admin | Delete customer |
| `/api/vendors` | POST | Admin | Create vendor |
| `/api/vendors` | GET | Admin | Get all vendors |
| `/api/vendors/:id` | GET | Admin | Get one vendor |
| `/api/vendors/:id` | PUT | Admin | Update vendor |
| `/api/vendors/:id` | DELETE | Admin | Delete vendor |
| `/api/items` | POST | Admin | Create item |
| `/api/items` | GET | Admin | Get all items |
| `/api/items/:id` | GET | Admin | Get one item |
| `/api/items/:id` | PUT | Admin | Update item |
| `/api/items/:id` | DELETE | Admin | Delete item |
| `/api/cargo` | POST | Admin | Create cargo |
| `/api/cargo` | GET | Admin | Get all cargo |
| `/api/cargo/:id` | GET | Admin | Get one cargo |
| `/api/cargo/:id` | PUT | Admin | Update cargo |
| `/api/cargo/:id` | DELETE | Admin | Delete cargo |
| `/api/orders/stats` | GET | Admin | Dashboard stats |
| `/api/orders` | POST | Admin / Salesman | Create order (salesman: sell only) |
| `/api/orders` | GET | Admin / Salesman | List orders (salesman: scoped) |
| `/api/orders/:id` | GET | Admin / Salesman | Get one order (salesman: scoped) |
| `/api/orders/salesman/list` | GET | Salesman | List orders (salesman token only) |
| `/api/orders/salesman/:id` | GET | Salesman | Get one order (salesman token only) |
| `/api/orders/:id/status` | PUT | Admin / Salesman | Status transition (salesman: to roll → rolled only) |
| `/api/orders/:id` | PUT | Admin | Full order update |
| `/api/orders/:id` | DELETE | Admin | Delete order |
| `/api/items/salesman/list` | GET | Salesman | List items (read-only) |
| `/api/items/salesman/:id` | GET | Salesman | Get one item |
| `/api/customers/salesman/list` | GET | Salesman | List customers (subset fields) |
| `/api/customers/salesman/:id` | GET | Salesman | Get one customer |
| `/api/vendors/salesman/list` | GET | Salesman | List vendors (subset fields) |
| `/api/vendors/salesman/:id` | GET | Salesman | Get one vendor |
| `/api/cargo/salesman/list` | GET | Salesman | List cargo (name) |
| `/api/cargo/salesman/:id` | GET | Salesman | Get one cargo |

---

*Documentation generated for SRF Backend API*

