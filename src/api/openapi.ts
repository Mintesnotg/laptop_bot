import { CLIENT_USAGE_VALUES } from "../shared/constants";

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Telegram Laptop Recommendation Bot API",
    version: "1.1.0",
    description: "API documentation for recommendation, user preference, and admin endpoints."
  },
  servers: [{ url: "http://localhost:3000" }],
  tags: [
    { name: "Health" },
    { name: "Recommendations" },
    { name: "Users" },
    { name: "Admin Auth" },
    { name: "Admin" }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      },
      AdminApiKey: {
        type: "apiKey",
        in: "header",
        name: "x-admin-api-key"
      }
    },
    schemas: {
      BudgetKey: {
        type: "string",
        description: "Dynamic budget key from active BudgetOption rows (/api/options/budgets)."
      },
      UsageTag: {
        type: "string",
        pattern: "^[A-Z0-9_]+$",
        example: "GRAPHICS_DESIGN"
      },
      UsageInput: {
        type: "string",
        description: "Usage key or alias. Input is normalized to uppercase underscore keys.",
        examples: CLIENT_USAGE_VALUES
      },
      RecommendationRequest: {
        type: "object",
        required: ["budgetKey", "usage", "ramGb", "storageGb"],
        properties: {
          telegramUserId: { type: "string", example: "123456789" },
          budgetKey: { $ref: "#/components/schemas/BudgetKey" },
          usage: {
            oneOf: [
              { $ref: "#/components/schemas/UsageInput" },
              {
                type: "array",
                minItems: 1,
                items: { $ref: "#/components/schemas/UsageInput" }
              }
            ]
          },
          ramGb: { type: "integer", minimum: 4, example: 16 },
          storageGb: { type: "integer", minimum: 128, example: 512 },
          limit: { type: "integer", minimum: 1, maximum: 10, default: 5 }
        }
      },
      RecommendationResponse: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            properties: {
              budgetKey: { type: "string" },
              budget: { type: "string" },
              budgetMin: { type: "integer" },
              budgetMax: { type: "integer" },
              usage: {
                type: "array",
                items: { type: "string" }
              },
              ramGb: { type: "integer" },
              storageGb: { type: "integer" }
            }
          },
          matchMode: { type: "string", enum: ["strict", "relaxed", "closest"] },
          hintMessage: { type: "string" },
          items: {
            type: "array",
            items: {
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
                usageTags: {
                  type: "array",
                  items: { $ref: "#/components/schemas/UsageTag" }
                },
                featureLines: {
                  type: "array",
                  items: { type: "string" }
                },
                description: { type: "string", nullable: true },
                score: { type: "number" },
                imageUrl: { type: "string", nullable: true },
                imageUrls: {
                  type: "array",
                  items: { type: "string", nullable: true }
                }
              }
            }
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
      LoginRequest: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string" },
          password: { type: "string" }
        }
      },
      LoginResponse: {
        type: "object",
        properties: {
          token: { type: "string" },
          user: {
            type: "object",
            properties: {
              id: { type: "string" },
              username: { type: "string" },
              displayName: { type: "string", nullable: true },
              isActive: { type: "boolean" }
            }
          }
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
          featureLines: {
            type: "array",
            items: { type: "string" }
          },
          description: { type: "string" },
          imageUrls: {
            type: "array",
            items: { type: "string", format: "uri" }
          }
        }
      },
      BrandOptionInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          sortOrder: { type: "integer", default: 0 },
          isActive: { type: "boolean", default: true }
        }
      },
      BrandOptionResponse: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          sortOrder: { type: "integer" },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" }
        }
      },
      ProductStatusInput: {
        type: "object",
        required: ["isActive"],
        properties: {
          isActive: { type: "boolean" }
        }
      },
      ChannelOptionInput: {
        type: "object",
        required: ["channelTarget"],
        properties: {
          channelTarget: { type: "string", example: "@my_channel" }
        }
      },
      ChannelOptionResponse: {
        type: "object",
        properties: {
          channelTarget: { type: "string" }
        }
      },
      TelegramPostingConfig: {
        type: "object",
        properties: {
          sellerPhones: { type: "array", items: { type: "string" } },
          telegramUsername: { type: "string" },
          telegramProfileUrl: { type: "string" },
          fullAddress: { type: "string" },
          ctaText: { type: "string" },
          fallbackImageUrl: { type: "string" }
        }
      },
      ChannelPostResult: {
        type: "object",
        properties: {
          attempted: { type: "boolean" },
          success: { type: "boolean" },
          message: { type: "string" }
        }
      },
      ChannelSyncResult: {
        type: "object",
        properties: {
          attempted: { type: "boolean" },
          success: { type: "boolean" },
          message: { type: "string" }
        }
      },
      ProductChannelPublicationSummary: {
        type: "object",
        properties: {
          id: { type: "string" },
          lastPublishedAt: { type: "string", format: "date-time" },
          lastSyncError: { type: "string", nullable: true }
        }
      },
      ProductPublishResponse: {
        type: "object",
        properties: {
          channelPost: { $ref: "#/components/schemas/ChannelPostResult" },
          publication: { $ref: "#/components/schemas/ProductChannelPublicationSummary" }
        }
      },
      ProductListResponse: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "object" }
          },
          pagination: {
            type: "object",
            properties: {
              page: { type: "integer" },
              pageSize: { type: "integer" },
              total: { type: "integer" },
              totalPages: { type: "integer" }
            }
          }
        }
      },
      UploadResponse: {
        type: "object",
        properties: {
          files: {
            type: "array",
            items: {
              type: "object",
              properties: {
                filename: { type: "string" },
                originalName: { type: "string" },
                mimetype: { type: "string" },
                size: { type: "integer" },
                url: { type: "string" }
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
            description: "Validation error"
          },
          "500": {
            description: "Internal server error"
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
          "201": { description: "Preference created" },
          "400": { description: "Validation error" }
        }
      }
    },
    "/api/options/brands": {
      get: {
        tags: ["Recommendations"],
        summary: "List active laptop brands",
        responses: {
          "200": {
            description: "Active brand options",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          description: { type: "string" }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/admin/auth/login": {
      post: {
        tags: ["Admin Auth"],
        summary: "Login to admin dashboard",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" }
            }
          }
        },
        responses: {
          "200": {
            description: "Authenticated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginResponse" }
              }
            }
          },
          "401": { description: "Invalid credentials" }
        }
      }
    },
    "/api/admin/auth/me": {
      get: {
        tags: ["Admin Auth"],
        summary: "Get current admin profile",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        responses: {
          "200": { description: "Authenticated admin" },
          "401": { description: "Unauthorized" }
        }
      }
    },
    "/api/admin/products": {
      get: {
        tags: ["Admin"],
        summary: "List products with pagination",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 10, maximum: 50 } },
          { name: "search", in: "query", schema: { type: "string" } }
        ],
        responses: {
          "200": {
            description: "Products list",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductListResponse" }
              }
            }
          }
        }
      },
      post: {
        tags: ["Admin"],
        summary: "Create product",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProductInput" }
            }
          }
        },
        responses: {
          "201": {
            description: "Product created (not posted to Telegram until Publish is used)",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: true }
              }
            }
          },
          "400": { description: "Validation error" },
          "409": { description: "Active product with same brand and model already exists" }
        }
      }
    },
    "/api/admin/options/brands": {
      get: {
        tags: ["Admin"],
        summary: "List all brand options",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        responses: {
          "200": {
            description: "Brand options list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    items: {
                      type: "array",
                      items: { $ref: "#/components/schemas/BrandOptionResponse" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["Admin"],
        summary: "Create a brand option",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BrandOptionInput" }
            }
          }
        },
        responses: {
          "201": {
            description: "Brand option created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BrandOptionResponse" }
              }
            }
          },
          "400": { description: "Validation error" },
          "409": { description: "Duplicate brand name" }
        }
      }
    },
    "/api/admin/options/brands/{id}": {
      put: {
        tags: ["Admin"],
        summary: "Update a brand option",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BrandOptionInput" }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated brand option",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/BrandOptionResponse" }
              }
            }
          },
          "400": { description: "Validation error" },
          "404": { description: "Brand not found" },
          "409": { description: "Duplicate brand name" }
        }
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a brand option and reassign affected products to Unknown",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Brand option deleted" },
          "400": { description: "Reserved brand cannot be deleted" },
          "404": { description: "Brand not found" }
        }
      }
    },
    "/api/admin/options/channel": {
      get: {
        tags: ["Admin"],
        summary: "Get Telegram channel target used for manual publish/replace",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        responses: {
          "200": {
            description: "Current channel target",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChannelOptionResponse" }
              }
            }
          }
        }
      },
      put: {
        tags: ["Admin"],
        summary: "Set Telegram channel target used for manual publish/replace",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ChannelOptionInput" }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated channel target",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChannelOptionResponse" }
              }
            }
          },
          "400": { description: "Validation error" }
        }
      }
    },
    "/api/admin/options/telegram-posting": {
      get: {
        tags: ["Admin"],
        summary: "Get Telegram posting settings (contact/CTA/address/fallback image)",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        responses: {
          "200": {
            description: "Current Telegram posting settings",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TelegramPostingConfig" }
              }
            }
          }
        }
      },
      put: {
        tags: ["Admin"],
        summary: "Update Telegram posting settings (contact/CTA/address/fallback image)",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/TelegramPostingConfig" }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated Telegram posting settings",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TelegramPostingConfig" }
              }
            }
          },
          "400": { description: "Validation error" }
        }
      }
    },
    "/api/admin/products/{id}": {
      put: {
        tags: ["Admin"],
        summary: "Update product (auto-replace Telegram listing when already listed)",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
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
            description: "Product updated; may include channelSync when an existing channel listing is replaced",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    channelSync: { $ref: "#/components/schemas/ChannelSyncResult" }
                  },
                  additionalProperties: true
                }
              }
            }
          },
          "400": { description: "Validation error" },
          "409": { description: "Active product with same brand and model already exists" }
        }
      }
    },
    "/api/admin/products/{id}/publish": {
      post: {
        tags: ["Admin"],
        summary: "Publish or replace an active product listing on the configured Telegram channel",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": {
            description: "Publish/replace attempted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductPublishResponse" }
              }
            }
          },
          "400": { description: "Inactive product or channel not configured" },
          "404": { description: "Product not found" }
        }
      }
    },
    "/api/admin/products/{id}/status": {
      patch: {
        tags: ["Admin"],
        summary: "Activate or deactivate a product (deactivate removes listing; activate does not auto-publish)",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProductStatusInput" }
            }
          }
        },
        responses: {
          "200": {
            description:
              "Product status updated; deactivation may include channelSync when listing removal is attempted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    channelSync: { $ref: "#/components/schemas/ChannelSyncResult" }
                  },
                  additionalProperties: true
                }
              }
            }
          },
          "400": { description: "Validation error" },
          "409": { description: "Active product with same brand and model already exists" },
          "404": { description: "Product not found" }
        }
      }
    },
    "/api/admin/uploads": {
      post: {
        tags: ["Admin"],
        summary: "Upload one or more product images",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  images: {
                    type: "array",
                    items: { type: "string", format: "binary" }
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Uploaded files",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UploadResponse" }
              }
            }
          }
        }
      }
    },
    "/api/admin/analytics": {
      get: {
        tags: ["Admin"],
        summary: "Get recommendation analytics",
        security: [{ BearerAuth: [] }, { AdminApiKey: [] }],
        responses: {
          "200": { description: "Analytics result" }
        }
      }
    }
  }
} as const;
