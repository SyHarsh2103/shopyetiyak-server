import { connectDatabase, disconnectDatabase } from "../database/mongoose.js";
import { CategoryModel } from "../modules/categories/category.model.js";
import { CollectionModel } from "../modules/collections/collection.model.js";
import { createSlug } from "../utils/slug.js";

interface CategorySeed {
  name: string;
  children?: CategorySeed[];
}

const categories: CategorySeed[] = [
  { name: "Grocery", children: [
    { name: "Rice & Grains" }, { name: "Flour & Baking" }, { name: "Lentils, Beans & Pulses" }, { name: "Oils & Ghee" },
    { name: "Fresh Produce", children: [{ name: "Vegetables" }, { name: "Fruits" }, { name: "Fresh Herbs" }] },
    { name: "Meat & Seafood", children: [{ name: "Fresh Meat" }, { name: "Seafood" }] },
    { name: "Frozen Foods", children: [{ name: "Ice Cream & Desserts" }] },
    { name: "Instant Foods" }, { name: "Snacks" }, { name: "Sweets & Chocolates" }, { name: "Spices & Seasonings" }, { name: "Canned & Packaged Foods" },
    { name: "Beverages", children: [{ name: "Tea" }, { name: "Coffee" }, { name: "Drinks" }] },
    { name: "Dairy & Eggs" }, { name: "Bakery" }, { name: "Ready to Eat" }, { name: "Ready-to-Cook" }, { name: "Organic & Healthy" },
    { name: "Household Essentials" }, { name: "Personal Care" }, { name: "Beauty & Cosmetics" }, { name: "Traditional Jewelry" },
    { name: "Fashion & Clothing", children: [{ name: "Women's Clothing" }, { name: "Men's Clothing" }, { name: "Kids Wear" }] },
    { name: "Religious & Cultural" }, { name: "Gifts" }, { name: "Asian Foods" },
  ] },
];

const collections = [
  "Weekly Deals", "Festival Specials", "Best Sellers", "New Arrivals", "Featured Products",
  "Seasonal Products", "Clearance", "Wedding Collection", "Party Collection", "Organic Collection", "Trending Products",
];

async function seedCategoryTree(nodes: CategorySeed[], parentId: string | null = null): Promise<void> {
  for (const [index, node] of nodes.entries()) {
    const slug = createSlug(node.name);
    const category = await CategoryModel.findOneAndUpdate(
      { slug },
      { $set: { name: node.name, slug, parentId, sortOrder: index * 10, isActive: true }, $setOnInsert: { description: "", seo: { title: "", description: "", keywords: [] } } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (node.children?.length) await seedCategoryTree(node.children, category._id.toString());
  }
}

async function seed(): Promise<void> {
  await connectDatabase();
  await seedCategoryTree(categories);
  for (const [index, name] of collections.entries()) {
    const slug = createSlug(name);
    await CollectionModel.updateOne(
      { slug },
      { $set: { name, slug, sortOrder: index * 10, isActive: true }, $setOnInsert: { description: "", seo: { title: "", description: "", keywords: [] } } },
      { upsert: true, setDefaultsOnInsert: true },
    );
  }
  console.log("Initial category hierarchy and catalog collections seeded successfully.");
  await disconnectDatabase();
}

void seed().catch(async (error: unknown) => {
  console.error(error);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
