# 🚀 Quick Setup Instructions

## ⚙️ Backend Environment Variables

Create a `.env` file in the `backend` directory with the following:

```env
# Server Configuration
PORT=5000

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/srf-database

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-to-something-random

# Admin Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# OneSignal Configuration (for push notifications)
ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_REST_API_KEY=your-onesignal-rest-api-key

# WhatsApp API Configuration (for delivery notifications)
WHATSAPP_API_URL=https://your-whatsapp-api-endpoint.com/send
WHATSAPP_API_KEY=your-whatsapp-api-key
```

## 🎨 Frontend Environment Variables

Create a `.env` file in the `admin` directory with:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

## 🏃 Running the Application

### Terminal 1 - Backend
```bash
cd backend
node server.js
```

### Terminal 2 - Frontend
```bash
cd admin
npm run dev
```

## 🔑 First Login

1. Open your browser and navigate to `http://localhost:5173`
2. Login with:
   - Username: `admin`
   - Password: `admin123` (or whatever you set in backend .env)

## ✅ Checklist

Before running:
- [ ] MongoDB is running
- [ ] Backend `.env` file created
- [ ] Frontend `.env` file created
- [ ] Backend dependencies installed (`npm install` in backend folder)
- [ ] Frontend dependencies installed (`npm install` in admin folder)

## 🎯 Quick Test

After login, you should:
1. See the dashboard with statistics
2. Be able to navigate between different sections
3. Create a test salesman
4. Create a test customer
5. Create a test item
6. Create a test order

## 🔧 Optional Configuration

### OneSignal Setup
1. Create account at https://onesignal.com
2. Create a new app
3. Get your App ID and REST API Key
4. Add them to backend `.env`

### WhatsApp API Setup
This depends on your WhatsApp API provider. Common options:
- Twilio
- MessageBird
- WhatsApp Business API

Update the backend `.env` with your provider's details.

## 📞 Need Help?

If you encounter issues:
1. Check that MongoDB is running
2. Verify both `.env` files are created
3. Check the terminal logs for errors
4. Ensure ports 5000 and 5173 are not in use

