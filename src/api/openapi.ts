import { BUDGET_KEYS, USAGE_KEYS } from "../shared/constants";

const usageInputValues = [...USAGE_KEYS, "UX/UI"];

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Telegram Laptop Recommendation Bot API",
    version: "1.0.0",
    description: "API documentation for recommendation, user preference, and admin endpoints."
  },
  servers: [{ url: "http://localhost:3000" }],
  tags: [
    { name: "Health" },
    { name: "Recommendations" },
    { name: "Users" },
    { name: "Admin" }
  ],
  components: {
    securitySchemes: {
      AdminApiKey: {
        type: "apiKey",
        in: "header",
        name: "x-admin-api-key"
      }
    },
    schemas: {
      BudgetKey: {
        type: "string",
        enum: BUDGET_KEYS
      },
      UsageTag: {
        type: "string",
        enum: USAGE_KEYS
      },
      UsageInput: {
        type: "string",
        enum: usageInputValues
      },
      RecommendationRequest: {
        type: "object",
        required: ["budgetKey", "usage", "ramGb", "storageGb"],
        properties: {
          telegramUserId: { type: "string", example: "123456789" },
          budgetKey: { $ref: "#/components/schemas/BudgetKey" },
          usage: { $ref: "#/components/schemas/UsageInput" },
          ramGb: { type: "integer", minimum: 4, example: 16 },
          storageGb: { type: "integer", minimum: 128, example: 512 },
          limit: { type: "integer", minimum: 1, maximum: 10, default: 5 }
        }
      },
      RecommendationItem: {
        type: "object",
        properties: {
          id: { type: "string" },
          brand: { type: "string" },
          model: { type: "string" },
          price: { type: "integer" },
          ramGb: { type: "integer" },
          storageGb: { type: "integer" },
          storageType: { type: "string", enum: ["SSD", "NVME", "HDD"] },
          cpu: { type: "string" },
          gpu: { type: "string", nullable: true },
          description: { type: "string", nullable: true },
          score: { type: "number" },
          imageUrl: { type: "string", nullable: true }
        }
      },
      RecommendationResponse: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            properties: {
              budget: { type: "string" },
              usage: { type: "string" },
              ramGb: { type: "integer" },
              storageGb: { type: "integer" }
            }
          },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/RecommendationItem" }
          }
        }
      },
      UserPreferenceRequest: {
        type: "object",
        required: ["telegramUserId", "budgetMin", "budgetMax", "usageTag", "ramGb", "storageGb"],
        properties: {
          telegramUserId: { type: "string", example: "123456789" },
          username: { type: "string" },
          firstName: { type: "string" },
          lastName: { type: "string" },
          languageCode: { type: "string" },
          budgetMin: { type: "integer", minimum: 1 },
          budgetMax: { type: "integer", minimum: 1 },
          usageTag: { $ref: "#/components/schemas/UsageInput" },
          ramGb: { type: "integer", minimum: 1 },
          storageGb: { type: "integer", minimum: 1 }
        }
      },
      ProductInput: {
        type: "object",
        required: ["brand", "model", "price", "ramGb", "storageGb", "storageType", "cpu", "usageTags"],
        properties: {
          brand: { type: "string" },
          model: { type: "string" },
          price: { type: "integer", minimum: 1 },
          ramGb: { type: "integer", minimum: 1 },
          storageGb: { type: "integer", minimum: 1 },
          storageType: { type: "string", enum: ["SSD", "NVME", "HDD"] },
          cpu: { type: "string" },
          gpu: { type: "string" },
          usageTags: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/UsageInput" }
          },
          description: { type: "string" },
          imageUrls: {
            type: "array",
            items: { type: "string", format: "uri" }
          }
        }
      },
      ProductUpdateInput: {
        type: "object",
        properties: {
          brand: { type: "string" },
          model: { type: "string" },
          price: { type: "integer", minimum: 1 },
          ramGb: { type: "integer", minimum: 1 },
          storageGb: { type: "integer", minimum: 1 },
          storageType: { type: "string", enum: ["SSD", "NVME", "HDD"] },
          cpu: { type: "string" },
          gpu: { type: "string" },
          usageTags: {
            type: "array",
            minItems: 1,
            items: { $ref: "#/components/schemas/UsageInput" }
          },
          description: { type: "string" },
          imageUrls: {
            type: "array",
            items: { type: "string", format: "uri" }
          }
        }
      },
      ProductImage: {
        type: "object",
        properties: {
          id: { type: "string" },
          productId: { type: "string" },
          imageUrl: { type: "string" },
          sortOrder: { type: "integer" }
        }
      },
      Product: {
        type: "object",
        properties: {
          id: { type: "string" },
          brand: { type: "string" },
          model: { type: "string" },
          price: { type: "integer" },
          ramGb: { type: "integer" },
          storageGb: { type: "integer" },
          storageType: { type: "string" },
          cpu: { type: "string" },
          gpu: { type: "string", nullable: true },
          usageTags: {
            type: "array",
            items: { $ref: "#/components/schemas/UsageTag" }
          },
          description: { type: "string", nullable: true },
          isActive: { type: "boolean" },
          images: {
            type: "array",
            items: { $ref: "#/components/schemas/ProductImage" }
          },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      AnalyticsResponse: {
        type: "object",
        properties: {
          popularUsage: {
            type: "array",
            items: {
              type: "object",
              properties: {
                usageTag: { $ref: "#/components/schemas/UsageTag" },
                _count: {
                  type: "object",
                  properties: {
                    _all: { type: "integer" }
                  }
                }
              }
            }
          },
          topBudgets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                budgetMin: { type: "integer" },
                budgetMax: { type: "integer" },
                _count: {
                  type: "object",
                  properties: {
                    _all: { type: "integer" }
                  }
                }
              }
            }
          },
          topProducts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productId: { type: "string" },
                count: { type: "integer" },
                brand: { type: "string" },
                model: { type: "string" }
              }
            }
          }
        }
      },
      ValidationErrorResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
          errors: { type: "object", additionalProperties: true }
        }
      },
      GenericErrorResponse: {
        type: "object",
        properties: {
          message: { type: "string" }
        }
      }
    }
  },
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          "200": {
            description: "Service health",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "ok" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/recommendations": {
      post: {
        tags: ["Recommendations"],
        summary: "Get top laptop recommendations",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RecommendationRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Recommendation results",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RecommendationResponse" }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" }
              }
            }
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GenericErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/user-preferences": {
      post: {
        tags: ["Users"],
        summary: "Save user preference snapshot",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UserPreferenceRequest" }
            }
          }
        },
        responses: {
          "201": {
            description: "Preference created"
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/admin/products": {
      get: {
        tags: ["Admin"],
        summary: "List all products",
        security: [{ AdminApiKey: [] }],
        responses: {
          "200": {
            description: "Products list",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Product" }
                }
              }
            }
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GenericErrorResponse" }
              }
            }
          }
        }
      },
      post: {
        tags: ["Admin"],
        summary: "Create a product",
        security: [{ AdminApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProductUpdateInput" }
            }
          }
        },
        responses: {
          "201": {
            description: "Product created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Product" }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" }
              }
            }
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GenericErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/admin/products/{id}": {
      put: {
        tags: ["Admin"],
        summary: "Update a product",
        security: [{ AdminApiKey: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProductInput" }
            }
          }
        },
        responses: {
          "200": {
            description: "Product updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Product" }
              }
            }
          },
          "400": {
            description: "Validation error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ValidationErrorResponse" }
              }
            }
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GenericErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/api/admin/analytics": {
      get: {
        tags: ["Admin"],
        summary: "Get usage and recommendation analytics",
        security: [{ AdminApiKey: [] }],
        responses: {
          "200": {
            description: "Analytics result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AnalyticsResponse" }
              }
            }
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/GenericErrorResponse" }
              }
            }
          }
        }
      }
    }
  }
} as const;
