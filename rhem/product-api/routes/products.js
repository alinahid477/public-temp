const express = require("express");
const router = express.Router();
const jsonfile = require("jsonfile");
const path = require("path");

const file = path.join(__dirname, "../products.json");
const IMAGE_BASE_URL = "http://127.0.0.1/";

// Updated to prepend the base URL to the relative image_url stored in the JSON
function addImageUrl(products) {
    return products.map(p => ({
        ...p,
        image_url: p.image_url 
            ? (p.image_url.startsWith('http') ? p.image_url : `${IMAGE_BASE_URL}${p.image_url}`) 
            : null
    }));
}

function addImage(product) {
    return {
        ...product,
        image_url: product.image_url 
            ? (product.image_url.startsWith('http') ? product.image_url : `${IMAGE_BASE_URL}${product.image_url}`) 
            : null
    };
}

async function readProducts() {
    return await jsonfile.readFile(file);
}

async function writeProducts(products) {
    await jsonfile.writeFile(file, products, { spaces: 2 });
}

function generateId(products) {
    if (products.length === 0) return 1;
    return Math.max(...products.map(p => p.id), 0) + 1;
}

// Helper to slugify the name for new product image paths
function generateImagePath(name) {
    if (!name) return "";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    return `images/${slug}.jpg`;
}

router.get("/", async (req, res) => {
    const products = await readProducts();
    res.json(addImageUrl(products));
});

// Moved /search ABOVE /:id so it doesn't get swallowed by the ID parameter
router.get("/search", async (req, res) => {
    const name = (req.query.name || "").toLowerCase();
    const products = await readProducts();
    const results = products.filter(p =>
        p.name.toLowerCase().includes(name)
    );
    res.json(addImageUrl(results));
});

router.get("/:id", async (req, res) => {
    const products = await readProducts();
    const product = products.find(p => p.id == req.params.id);

    if (!product)
        return res.status(404).json({ message: "Product not found" });

    res.json(addImage(product));
});

router.post("/", async (req, res) => {
    const products = await readProducts();

    const newProduct = {
        id: generateId(products),
        name: req.body.name,
        price: req.body.price,
        emoji: req.body.emoji,
        category: req.body.category,
        description: req.body.description,
        // Calculate the formatted image path upon creation
        image_url: req.body.image_url || generateImagePath(req.body.name) 
    };

    products.push(newProduct);
    await writeProducts(products);

    res.status(201).json(addImage(newProduct));
});

router.put("/:id", async (req, res) => {
    const products = await readProducts();
    const index = products.findIndex(p => p.id == req.params.id);

    if (index === -1)
        return res.status(404).json({ message: "Product not found" });

    products[index] = {
        ...products[index],
        ...req.body
    };

    await writeProducts(products);
    res.json(addImage(products[index]));
});

router.delete("/:id", async (req, res) => {
    const products = await readProducts();
    const index = products.findIndex(p => p.id == req.params.id);

    if (index === -1)
        return res.status(404).json({ message: "Product not found" });

    const deleted = products.splice(index, 1);
    await writeProducts(products);

    res.json({
        message: "Product deleted",
        product: deleted[0]
    });
});

module.exports = router;