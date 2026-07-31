# SRF - Salesman Admin Communication System

A full-stack MERN application for managing orders, customers, vendors, and salesman communication.

## 🚀 Project Structure

```
srf/
├── backend/          # Node.js + Express.js backend
├── admin/            # React.js admin frontend
└── firestore-export/ # Firestore data export
```

## 📋 Prerequisites

- Node.js (v20 or higher)
- MongoDB (local or Atlas)
- npm or yarn

## 🛠️ Backend Setup

### 1. Navigate to backend directory
```bash
cd backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create .env file
```bash
cp .env.example .env
```

### 4. Configure environment variables
Edit `.env` file with your configuration:
- `MONGODB_URI`: Your MongoDB connection string
- `JWT_SECRET`: A secure random string for JWT
- `ADMIN_USERNAME`: Admin username
- `ADMIN_PASSWORD`: Admin password (can be plain text or bcrypt hash)
- `ONESIGNAL_APP_ID`: Your OneSignal App ID
- `ONESIGNAL_REST_API_KEY`: Your OneSignal REST API Key
- `WHATSAPP_API_URL`: Your WhatsApp API endpoint
- `WHATSAPP_API_KEY`: Your WhatsApp API key

### 5. Start the backend server
```bash
node server.js
```

Backend will run on `http://localhost:5000`

## 🎨 Frontend Setup

### 1. Navigate to admin directory
```bash
cd admin
```

### 2. Install dependencies
```bash
npm install
```

### 3. Create .env file
Create a `.env` file with:
```
VITE_API_BASE_URL=http://localhost:5000/api
```

### 4. Start the development server
```bash
npm run dev
```

Frontend will run on `http://localhost:5173` (or another port if 5173 is busy)

## 📚 Features

### Admin Features
- ✅ Dashboard with order statistics
- ✅ Manage Salesmen (CRUD)
- ✅ Manage Customers (CRUD with blocking)
- ✅ Manage Vendors (CRUD with blocking)
- ✅ Manage Items (CRUD)
- ✅ Manage Cargo companies (CRUD)
- ✅ Manage Orders with status workflow
- ✅ Filter orders by status, type, month, year
- ✅ Export orders to Excel
- ✅ Custom confirmation modals
- ✅ Responsive design

### Order Workflow
1. **Pending** → Salesman creates order
2. **To Roll** → Admin updates status
3. **Rolled** → Salesman completes rolling
4. **Billed** → Admin bills the order
5. **Delivered** → Admin marks as delivered (sends WhatsApp message)

### Notifications
- **Push Notifications**: Sent to admin when order is created (via OneSignal)
- **WhatsApp**: Sent to customer when order is delivered

## 🔐 Default Credentials

Set these in your backend `.env` file:
- Username: `admin` (or your configured value)
- Password: Set in `ADMIN_PASSWORD`

## 📡 API Endpoints

### Admin Auth
- `POST /api/admin/login` - Admin login
- `GET /api/admin/verify` - Verify token

### Salesman
- `POST /api/salesman/login` - Salesman login
- `POST /api/salesman` - Create salesman (Admin)
- `GET /api/salesman` - List salesmen (Admin)
- `PUT /api/salesman/:id` - Update salesman (Admin)
- `DELETE /api/salesman/:id` - Delete salesman (Admin)

### Customers
- `POST /api/customers` - Create customer
- `GET /api/customers` - List customers
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Delete customer

### Vendors
- `POST /api/vendors` - Create vendor
- `GET /api/vendors` - List vendors
- `PUT /api/vendors/:id` - Update vendor
- `DELETE /api/vendors/:id` - Delete vendor

### Items
- `POST /api/items` - Create item
- `GET /api/items` - List items
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item

### Cargo
- `POST /api/cargo` - Create cargo
- `GET /api/cargo` - List cargo
- `PUT /api/cargo/:id` - Update cargo
- `DELETE /api/cargo/:id` - Delete cargo

### Orders
- `GET /api/orders/stats` - Dashboard statistics
- `POST /api/orders` - Create order
- `GET /api/orders` - List orders (with filters)
- `GET /api/orders/:id` - Get single order
- `PUT /api/orders/:id/status` - Update order status
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete order

## 🔧 Technologies Used

### Backend
- Node.js
- Express.js
- MongoDB with Mongoose
- JWT for authentication
- bcryptjs for password hashing
- axios for HTTP requests
- CORS for cross-origin requests

### Frontend
- React.js 19
- React Router v6
- Tailwind CSS 4
- Axios for API calls
- Lucide React for icons
- XLSX for Excel export

## 📝 Notes

- All admin routes require JWT authentication
- Salesmen can only create sell orders
- Blocked customers cannot have new orders
- Order status follows strict workflow transitions
- Excel export filters by selected month/year

## 🐛 Troubleshooting

### Backend won't start
- Check if MongoDB is running
- Verify `.env` file exists with correct values
- Check if port 5000 is available

### Frontend won't start
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check if backend URL in `.env` is correct
- Verify backend is running

### Can't login
- Verify admin credentials in backend `.env`
- Check browser console for errors
- Verify backend is running and accessible

## 📄 License

This project is proprietary and confidential.

## 👥 Support

For support, contact the development team.

