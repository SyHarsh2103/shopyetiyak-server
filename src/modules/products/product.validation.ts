import { z } from "zod";
import { objectIdSchema } from "../../utils/object-id.js";
import { seoSchema } from "../catalog/catalog.validation.js";
import {
  PRODUCT_TYPES,
  SELLING_UNITS,
  VARIANT_STATUSES,
} from "./product.model.js";

const optionalIdentifier = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((value) => value.toUpperCase())
    .optional(),
);

const imageSchema = z
  .object({
    storageKey: z.string().trim().min(1).max(500),
    url: z.string().trim().min(1).max(700),
    originalName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(120),
    size: z
      .number()
      .int()
      .positive()
      .max(5 * 1024 * 1024),

    altText: z
      .string()
      .trim()
      .max(180)
      .optional()
      .default(""),

    sortOrder: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .optional()
      .default(0),

    isPrimary: z
      .boolean()
      .optional()
      .default(false),
  })
  .strict();

const attributeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    value: z.string().trim().min(1).max(120),
  })
  .strict();

const weightSchema = z
  .object({
    value: z.number().nonnegative(),
    unit: z.enum([
      "GRAM",
      "KILOGRAM",
      "OUNCE",
      "POUND",
    ]),
  })
  .strict();

const dimensionsSchema = z
  .object({
    length: z.number().nonnegative(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    unit: z.enum(["CM", "IN"]),
  })
  .strict();

const pricingSchema = z
  .object({
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase()),

    costPriceMinor: z
      .number()
      .int()
      .nonnegative(),

    regularPriceMinor: z
      .number()
      .int()
      .nonnegative(),

    salePriceMinor: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional()
      .default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.salePriceMinor !== null &&
      value.salePriceMinor >
        value.regularPriceMinor
    ) {
      context.addIssue({
        code: "custom",
        path: ["salePriceMinor"],
        message:
          "Sale price cannot exceed regular price.",
      });
    }
  });

const variantSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((value) => value.toUpperCase()),

    barcode: optionalIdentifier,
    upc: optionalIdentifier,
    ean: optionalIdentifier,

    attributes: z
      .array(attributeSchema)
      .max(30)
      .optional()
      .default([]),

    pricing: pricingSchema,

    sellingUnit: z.enum(SELLING_UNITS),

    unitQuantity: z.number().positive(),

    minimumQuantity: z.number().positive(),

    maximumQuantity: z
      .number()
      .positive()
      .nullable()
      .optional()
      .default(null),

    quantityIncrement: z.number().positive(),

    weight: weightSchema
      .nullable()
      .optional()
      .default(null),

    dimensions: dimensionsSchema
      .nullable()
      .optional()
      .default(null),

    status: z
      .enum(VARIANT_STATUSES)
      .optional()
      .default("ACTIVE"),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.maximumQuantity !== null &&
      value.maximumQuantity <
        value.minimumQuantity
    ) {
      context.addIssue({
        code: "custom",
        path: ["maximumQuantity"],
        message:
          "Maximum quantity must be greater than or equal to minimum quantity.",
      });
    }
  });

const dietarySchema = z
  .object({
    vegetarian: z
      .boolean()
      .optional()
      .default(false),

    vegan: z
      .boolean()
      .optional()
      .default(false),

    glutenFree: z
      .boolean()
      .optional()
      .default(false),

    halal: z
      .boolean()
      .optional()
      .default(false),

    organic: z
      .boolean()
      .optional()
      .default(false),
  })
  .strict();

const nutritionSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    value: z.string().trim().min(1).max(120),
  })
  .strict();

/**
 * Keep the base object free of object-level refinements.
 *
 * This is required because the update schema must derive a
 * partial version from the same base object.
 */
const productFields = z
  .object({
    name: z.string().trim().min(2).max(180),

    slug: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional(),

    shortDescription: z
      .string()
      .trim()
      .max(500)
      .optional()
      .default(""),

    description: z
      .string()
      .trim()
      .max(12000)
      .optional()
      .default(""),

    brandId: objectIdSchema
      .nullable()
      .optional()
      .default(null),

    categoryIds: z
      .array(objectIdSchema)
      .max(30)
      .optional()
      .default([]),

    collectionIds: z
      .array(objectIdSchema)
      .max(30)
      .optional()
      .default([]),

    images: z
      .array(imageSchema)
      .max(20)
      .optional()
      .default([]),

    productType: z.enum(PRODUCT_TYPES),

    countryOfOrigin: z
      .string()
      .trim()
      .max(120)
      .optional()
      .default(""),

    ingredients: z
      .array(
        z.string().trim().min(1).max(300),
      )
      .max(200)
      .optional()
      .default([]),

    nutrition: z
      .array(nutritionSchema)
      .max(100)
      .optional()
      .default([]),

    allergens: z
      .array(
        z.string().trim().min(1).max(120),
      )
      .max(50)
      .optional()
      .default([]),

    storageInstructions: z
      .string()
      .trim()
      .max(1500)
      .optional()
      .default(""),

    dietary: dietarySchema
      .optional()
      .default({
        vegetarian: false,
        vegan: false,
        glutenFree: false,
        halal: false,
        organic: false,
      }),

    taxClassification: z
      .string()
      .trim()
      .max(100)
      .optional()
      .default(""),

    tags: z
      .array(
        z.string().trim().min(1).max(80),
      )
      .max(100)
      .optional()
      .default([]),

    relatedProductIds: z
      .array(objectIdSchema)
      .max(30)
      .optional()
      .default([]),

    frequentlyBoughtTogetherIds: z
      .array(objectIdSchema)
      .max(30)
      .optional()
      .default([]),

    variants: z
      .array(variantSchema)
      .min(1)
      .max(100),

    seo: seoSchema
      .optional()
      .default({
        title: "",
        description: "",
        keywords: [],
      }),

    isActive: z
      .boolean()
      .optional()
      .default(true),

    isFeatured: z
      .boolean()
      .optional()
      .default(false),
  })
  .strict();

interface ProductCrossFieldIssue {
  path: Array<string | number>;
  message: string;
}

interface ProductCrossFieldValue {
  variants?: Array<{
    sku: string;
    barcode?: string;
    upc?: string;
    ean?: string;
  }>;

  images?: Array<{
    isPrimary?: boolean;
  }>;
}

function getProductCrossFieldIssues(
  value: ProductCrossFieldValue,
): ProductCrossFieldIssue[] {
  const issues: ProductCrossFieldIssue[] = [];

  const uniqueFields = [
    "sku",
    "barcode",
    "upc",
    "ean",
  ] as const;

  if (value.variants) {
    for (const field of uniqueFields) {
      const seen = new Set<string>();

      value.variants.forEach(
        (variant, index) => {
          const raw = variant[field];

          const identifier =
            typeof raw === "string"
              ? raw.toUpperCase()
              : undefined;

          if (!identifier) {
            return;
          }

          if (seen.has(identifier)) {
            issues.push({
              path: [
                "variants",
                index,
                field,
              ],
              message:
                `Duplicate ${field.toUpperCase()} within this product.`,
            });
          }

          seen.add(identifier);
        },
      );
    }
  }

  const primaryCount =
    value.images?.filter(
      (image) => image.isPrimary,
    ).length ?? 0;

  if (primaryCount > 1) {
    issues.push({
      path: ["images"],
      message:
        "Only one image may be marked as primary.",
    });
  }

  return issues;
}

export const createProductSchema =
  productFields.superRefine(
    (value, context) => {
      for (
        const issue of
        getProductCrossFieldIssues(value)
      ) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    },
  );

export const updateProductSchema =
  productFields
    .partial()
    .superRefine((value, context) => {
      if (Object.keys(value).length === 0) {
        context.addIssue({
          code: "custom",
          path: [],
          message:
            "At least one product field must be provided.",
        });
      }

      for (
        const issue of
        getProductCrossFieldIssues(value)
      ) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    });

export const productImageMetadataSchema = z
  .object({
    altText: z
      .string()
      .trim()
      .max(180)
      .optional()
      .default(""),
  })
  .strict();

export const deleteProductImageSchema = z
  .object({
    storageKey: z
      .string()
      .trim()
      .min(1)
      .max(500),
  })
  .strict();