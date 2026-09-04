import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import path from "node:path";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { noStorePrivateResponses } from "./middleware/cache-control.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { apiRateLimit } from "./middleware/rate-limit.js";
import { rejectMongoOperators } from "./middleware/security.js";
import { adminSystemRouter } from "./modules/admins/admin-system.routes.js";
import { staffRouter } from "./modules/admins/staff.routes.js";
import { adminAuthRouter } from "./modules/auth/admin-auth.routes.js";
import { customerAuthRouter } from "./modules/auth/customer-auth.routes.js";
import {
  adminBulkOrderRouter,
  bulkOrderRouter,
} from "./modules/bulk-orders/bulk-order.routes.js";
import { cartRouter } from "./modules/carts/cart.routes.js";
import { catalogRouter } from "./modules/catalog/catalog.routes.js";
import { checkoutRouter } from "./modules/checkout/checkout.routes.js";
import { customerAccountRouter } from "./modules/customer-account/customer-account.routes.js";
import {
  adminCustomerValueRouter,
  customerValueRouter,
} from "./modules/customer-value/customer-value.routes.js";
import { adminDeliveryRouter } from "./modules/delivery/admin-delivery.routes.js";
import { deliveryRouter } from "./modules/delivery/delivery.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { adminOrderRouter } from "./modules/orders/admin-order.routes.js";
import { customerOrderRouter } from "./modules/orders/customer-order.routes.js";
import { orderRouter } from "./modules/orders/order.routes.js";
import { packingRouter } from "./modules/packing/packing.routes.js";
import { adminPaymentRouter } from "./modules/payments/admin-payment.routes.js";
import { paymentRouter } from "./modules/payments/payment.routes.js";
import { pickingRouter } from "./modules/picking/picking.routes.js";
import { adminPickupRouter } from "./modules/pickup/admin-pickup.routes.js";
import { pickupRouter } from "./modules/pickup/pickup.routes.js";
import {
  adminMarketingRouter,
} from "./modules/promotions/marketing.routes.js";
import {
  publicMarketingRouter,
} from "./modules/promotions/public-marketing.routes.js";
import { publicCatalogRouter } from "./modules/public-catalog/public-catalog.routes.js";
import { purchasingRouter } from "./modules/purchasing/purchasing.routes.js";
import {
  adminRecipeRouter,
  mealKitRouter,
  recipeRouter,
} from "./modules/recipes/recipe.routes.js";
import { reportRouter } from "./modules/reports/report.routes.js";
import { storeRouter } from "./modules/stores/store.routes.js";
import { supplierRouter } from "./modules/suppliers/supplier.routes.js";
import { stripeWebhookRouter } from "./modules/webhooks/stripe-webhook.routes.js";
import { ApiError } from "./utils/api-error.js";

export function createApp() {
  const app = express();

  if (env.TRUST_PROXY) {
    app.set("trust proxy", 1);
  }

  const allowedOrigins = new Set([
    env.CORS_CUSTOMER_ORIGIN,
    env.CORS_ADMIN_ORIGIN,
  ]);

  app.disable("x-powered-by");

  app.use(pinoHttp({ logger }));

  app.use(
    helmet({
      hsts:
        env.NODE_ENV === "production"
          ? {
              maxAge: 31_536_000,
              includeSubDomains: true,
              preload: false,
            }
          : false,
      crossOriginResourcePolicy: {
        policy: "same-site",
      },
    }),
  );

  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        callback(
          new ApiError(
            403,
            "CORS_ORIGIN_DENIED",
            "This origin is not allowed to access the API.",
          ),
        );
      },
    }),
  );

  app.use(compression());

  // Stripe signature verification requires the exact raw request bytes.
  // This route must remain mounted before express.json().
  app.use("/api/v1/webhooks/stripe", stripeWebhookRouter);

  app.use("/api/v1", apiRateLimit);

  app.use(
    express.json({
      limit: "1mb",
    }),
  );

  app.use(
    express.urlencoded({
      extended: false,
      limit: "1mb",
      parameterLimit: 100,
    }),
  );

  app.use(cookieParser());
  app.use(rejectMongoOperators);
  app.use("/api/v1", noStorePrivateResponses);

  app.use(
    "/uploads",
    express.static(path.resolve(env.UPLOAD_PATH), {
      dotfiles: "deny",
      maxAge: env.NODE_ENV === "production" ? "7d" : 0,
      setHeaders(response) {
        response.setHeader(
          "Cross-Origin-Resource-Policy",
          "cross-origin",
        );
      },
    }),
  );

  app.get("/health", (_req, res) =>
    res.status(200).json({
      success: true,
      data: {
        status: "ok",
      },
    }),
  );

  app.get("/ready", (_req, res) => {
    const ready =
      mongoose.connection.readyState ===
      mongoose.ConnectionStates.connected;

    res.status(ready ? 200 : 503).json({
      success: ready,
      ...(ready
        ? {
            data: {
              status: "ready",
            },
          }
        : {
            error: {
              code: "DATABASE_NOT_READY",
              message: "Database connection is not ready.",
            },
          }),
    });
  });

  app.use("/api/v1/auth/customer", customerAuthRouter);
  app.use("/api/v1/customer/account/orders", customerOrderRouter);
  app.use("/api/v1/customer/account", customerAccountRouter);
  app.use("/api/v1/customer-value", customerValueRouter);

  app.use("/api/v1/cart", cartRouter);
  app.use("/api/v1/checkout", checkoutRouter);
  app.use("/api/v1/delivery", deliveryRouter);
  app.use("/api/v1/pickup", pickupRouter);
  app.use("/api/v1/payments", paymentRouter);
  app.use("/api/v1/orders", orderRouter);

  app.use("/api/v1/auth/admin", adminAuthRouter);

  app.use("/api/v1/catalog", publicCatalogRouter);
  app.use("/api/v1/marketing", publicMarketingRouter);
  app.use("/api/v1/recipes", recipeRouter);
  app.use("/api/v1/meal-kits", mealKitRouter);
  app.use("/api/v1/bulk-orders", bulkOrderRouter);

  app.use("/api/v1/admin/system", adminSystemRouter);
  app.use("/api/v1/admin/staff", staffRouter);
  app.use("/api/v1/admin/catalog", catalogRouter);
  app.use("/api/v1/admin/marketing", adminMarketingRouter);
  app.use("/api/v1/admin/recipes", adminRecipeRouter);
  app.use("/api/v1/admin/bulk-orders", adminBulkOrderRouter);
  app.use(
    "/api/v1/admin/customer-value",
    adminCustomerValueRouter,
  );
  app.use("/api/v1/admin/stores", storeRouter);
  app.use("/api/v1/admin/inventory", inventoryRouter);
  app.use("/api/v1/admin/suppliers", supplierRouter);
  app.use("/api/v1/admin/purchasing", purchasingRouter);
  app.use("/api/v1/admin/payments", adminPaymentRouter);
  app.use("/api/v1/admin/orders", adminOrderRouter);
  app.use("/api/v1/admin/picking", pickingRouter);
  app.use("/api/v1/admin/packing", packingRouter);
  app.use("/api/v1/admin/delivery", adminDeliveryRouter);
  app.use("/api/v1/admin/pickup", adminPickupRouter);
  app.use("/api/v1/admin/reports", reportRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}