# API Documentation Guide

This folder contains complete API documentation and testing resources for the SRF Backend.

## 📁 Files Included

1. **API_DOCUMENTATION.md** - Complete API reference with all endpoints and test data
2. **SRF_API.postman_collection.json** - Postman collection for easy API testing

## 🚀 Quick Start

### Method 1: Using Postman (Recommended)

1. **Install Postman**
   - Download from: https://www.postman.com/downloads/

2. **Import the Collection**
   - Open Postman
   - Click "Import" button (top left)
   - Select `SRF_API.postman_collection.json`
   - Click "Import"

3. **Setup Environment Variables**
   - The collection includes variables that auto-populate:
     - `base_url` - Default: http://localhost:5000
     - `admin_token` - Auto-filled after admin login
     - `salesman_token` - Auto-filled after salesman login
     - Resource IDs (auto-filled after creating resources)

4. **Start Testing**
   - First, run "Admin Login" to get your token
   - Create resources (salesman, customer, vendor, item, cargo)
   - Test order creation and management
   - IDs are automatically saved to variables for subsequent requests!

### Method 2: Using Thunder Client (VS Code Extension)

1. **Install Extension**
   - Install "Thunder Client" from VS Code Extensions

2. **Import Collection**
   - Open Thunder Client
   - Click "Collections" → "Menu" → "Import"
   - Select `SRF_API.postman_collection.json`

3. **Test APIs** - Same as Postman!

### Method 3: Using curl (Command Line)

Reference the `API_DOCUMENTATION.md` file for detailed request/response examples.

**Example: Admin Login**
```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

**Example: Get All Customers (with token)**
```bash
curl -X GET http://localhost:5000/api/customers \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 📖 API Documentation Structure

The `API_DOCUMENTATION.md` file is organized into sections:

1. **Admin Authentication** - Login and token verification
2. **Salesman Management** - CRUD operations for salesmen
3. **Customer Management** - CRUD operations for customers
4. **Vendor Management** - CRUD operations for vendors
5. **Item Management** - CRUD operations for items
6. **Cargo Management** - CRUD operations for cargo companies
7. **Order Management** - Create and manage orders
8. **Authentication** - Token usage and security
9. **Error Responses** - Common error codes
10. **Quick Reference** - Summary table of all endpoints

## 🔑 Authentication Flow

### For Admin:
1. POST `/api/admin/login` with credentials
2. Receive JWT token
3. Use token in `Authorization: Bearer {token}` header

### For Salesman:
1. POST `/api/salesman/login` with credentials
2. Receive JWT token
3. Use token in `Authorization: Bearer {token}` header

## 📝 Test Data Examples

### Admin Login
```json
{
  "username": "admin",
  "password": "admin123"
}
```

### Create Salesman
```json
{
  "name": "John Doe",
  "username": "john_doe",
  "password": "password123",
  "phone": "+1234567890"
}
```

### Create Customer
```json
{
  "phone": "+1234567890",
  "name": "ABC Corporation",
  "gstin": "22AAAAA0000A1Z5",
  "isBlocked": false
}
```

### Create Item
```json
{
  "name": "Steel Rod 12mm",
  "rakNo": "A1-B2",
  "price": 450.50,
  "quantity": 100
}
```

### Create Order
```json
{
  "type": "sell order",
  "items": ["ITEM_ID_HERE"],
  "customerName": "CUSTOMER_ID_HERE",
  "cargo": "CARGO_ID_HERE",
  "status": "pending"
}
```

## 🎯 Testing Workflow (Recommended Order)

1. ✅ **Admin Login** - Get admin token
2. ✅ **Create Salesman** - Create at least one salesman
3. ✅ **Salesman Login** - Get salesman token
4. ✅ **Create Customer** - Create test customer
5. ✅ **Create Vendor** - Create test vendor
6. ✅ **Create Item** - Create test items
7. ✅ **Create Cargo** - Create cargo company
8. ✅ **Create Order** - Create test orders
9. ✅ **Test Other Operations** - Update, delete, etc.

## 🔒 Access Control Summary

| Resource | Create | Read | Update | Delete |
|----------|--------|------|--------|--------|
| Admin Auth | Public | Admin | - | - |
| Salesman | Admin | Admin | Admin | Admin |
| Customer | Admin | Admin | Admin | Admin |
| Vendor | Admin | Admin | Admin | Admin |
| Item | Admin | Admin | Admin | Admin |
| Cargo | Admin | Admin | Admin | Admin |
| Order | Both* | Both* | Admin | Admin |

*Salesmen can only see their own orders; Admins can see all orders.

## 🛠️ Environment Configuration

Make sure your `.env` file has these variables:

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret_key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
PORT=5000
```

## 📊 Order Status Flow

```
pending → to roll → rolled → billed → delivered
```

Valid status values:
- `pending`
- `to roll`
- `rolled`
- `billed`
- `delivered`

## 🆔 MongoDB ObjectId Format

All IDs in the system are MongoDB ObjectIds (24 character hex strings):
- Example: `64a1b2c3d4e5f6789012345`
- Auto-generated by MongoDB
- Used in all relationships (refs)

## 💡 Tips

1. **Auto Variables in Postman**: The collection automatically saves IDs and tokens after successful requests
2. **Token Expiration**: Tokens expire after 24 hours - just login again
3. **Error Handling**: Check the Error Responses section in the documentation
4. **Populated Data**: GET requests for orders automatically populate referenced data (items, customer, cargo, etc.)

## 🐛 Troubleshooting

### Issue: "Access denied. No token provided"
**Solution**: Make sure you've logged in and the token is in the Authorization header

### Issue: "Invalid token"
**Solution**: Token might be expired. Login again to get a new token

### Issue: "Resource not found"
**Solution**: Make sure the ID exists. Check if you created the resource first

### Issue: Cannot create order
**Solution**: Ensure all referenced IDs (items, customer, cargo) exist and are valid

## 📚 Additional Resources

- **MongoDB ObjectId**: https://docs.mongodb.com/manual/reference/method/ObjectId/
- **JWT**: https://jwt.io/
- **Postman Docs**: https://learning.postman.com/
- **Thunder Client**: https://www.thunderclient.com/

## 🤝 Support

For issues or questions:
1. Check the API_DOCUMENTATION.md for detailed endpoint information
2. Verify your .env configuration
3. Check server logs for detailed error messages
4. Ensure MongoDB is running and connected

---

**Happy Testing! 🚀**

