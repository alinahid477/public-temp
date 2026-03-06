const express = require("express");
const cors = require("cors");
const path = require("path");

const productRoutes = require("./routes/products");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// serve images
app.use("/images", express.static(path.join(__dirname, "public/images")));

// routes
app.use("/api/products", productRoutes);

app.listen(PORT, () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
});