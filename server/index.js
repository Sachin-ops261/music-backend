const dotenv = require('dotenv');
dotenv.config(); // ✅ Load environment variables FIRST

const app = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`server is running on http://localhost:${PORT}`);
});