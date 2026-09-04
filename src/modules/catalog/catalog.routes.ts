import { Router } from "express";
import { requireAdminAuth } from "../../middleware/auth/admin-auth.js";
import { requireCsrf } from "../../middleware/csrf.js";
import { requirePermission } from "../../middleware/rbac/require-permission.js";
import { uploadRateLimit } from "../../middleware/rate-limit.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { createBrandRecord, deleteBrandRecord, getBrandRecord, listBrandRecords, updateBrandRecord } from "../brands/brand.controller.js";
import { createCategoryRecord, deleteCategoryRecord, getCategoryRecord, listCategoryRecords, updateCategoryRecord } from "../categories/category.controller.js";
import { createCollectionRecord, deleteCollectionRecord, getCollectionRecord, listCollectionRecords, updateCollectionRecord } from "../collections/collection.controller.js";
import { archiveProductRecord, createProductRecord, deleteProductImageRecord, getProductRecord, listProductRecords, updateProductRecord, uploadProductImageRecord } from "../products/product.controller.js";
import { productImageUpload } from "../products/product-upload.middleware.js";

export const catalogRouter = Router();

catalogRouter.use(requireAdminAuth);

catalogRouter.get("/categories", requirePermission("catalog.read"), asyncHandler(listCategoryRecords));
catalogRouter.get("/categories/:id", requirePermission("catalog.read"), asyncHandler(getCategoryRecord));
catalogRouter.post("/categories", requireCsrf("admin"), requirePermission("categories.create"), asyncHandler(createCategoryRecord));
catalogRouter.patch("/categories/:id", requireCsrf("admin"), requirePermission("categories.update"), asyncHandler(updateCategoryRecord));
catalogRouter.delete("/categories/:id", requireCsrf("admin"), requirePermission("categories.delete"), asyncHandler(deleteCategoryRecord));

catalogRouter.get("/brands", requirePermission("catalog.read"), asyncHandler(listBrandRecords));
catalogRouter.get("/brands/:id", requirePermission("catalog.read"), asyncHandler(getBrandRecord));
catalogRouter.post("/brands", requireCsrf("admin"), requirePermission("brands.create"), asyncHandler(createBrandRecord));
catalogRouter.patch("/brands/:id", requireCsrf("admin"), requirePermission("brands.update"), asyncHandler(updateBrandRecord));
catalogRouter.delete("/brands/:id", requireCsrf("admin"), requirePermission("brands.delete"), asyncHandler(deleteBrandRecord));

catalogRouter.get("/collections", requirePermission("catalog.read"), asyncHandler(listCollectionRecords));
catalogRouter.get("/collections/:id", requirePermission("catalog.read"), asyncHandler(getCollectionRecord));
catalogRouter.post("/collections", requireCsrf("admin"), requirePermission("collections.create"), asyncHandler(createCollectionRecord));
catalogRouter.patch("/collections/:id", requireCsrf("admin"), requirePermission("collections.update"), asyncHandler(updateCollectionRecord));
catalogRouter.delete("/collections/:id", requireCsrf("admin"), requirePermission("collections.delete"), asyncHandler(deleteCollectionRecord));

catalogRouter.get("/products", requirePermission("catalog.read"), asyncHandler(listProductRecords));
catalogRouter.get("/products/:id", requirePermission("catalog.read"), asyncHandler(getProductRecord));
catalogRouter.post("/products", requireCsrf("admin"), requirePermission("products.create"), asyncHandler(createProductRecord));
catalogRouter.patch("/products/:id", requireCsrf("admin"), requirePermission("products.update"), asyncHandler(updateProductRecord));
catalogRouter.delete("/products/:id", requireCsrf("admin"), requirePermission("products.archive"), asyncHandler(archiveProductRecord));

catalogRouter.post(
  "/product-images",
  requireCsrf("admin"),
  requirePermission("product-images.upload"),
  uploadRateLimit,
  productImageUpload.single("file"),
  asyncHandler(uploadProductImageRecord),
);
catalogRouter.delete("/product-images", requireCsrf("admin"), requirePermission("product-images.delete"), asyncHandler(deleteProductImageRecord));
