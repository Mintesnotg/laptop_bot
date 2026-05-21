import "dotenv/config";
import bcrypt from "bcryptjs";
import { StorageType } from "@prisma/client";
import { prisma } from "../src/prisma";
import { BUDGET_RANGES, DEFAULT_USAGE_OPTIONS, RAM_OPTIONS, STORAGE_OPTIONS } from "../src/shared/constants";

type SeedProduct = {
  brand: string;
  model: string;
  price: number;
  ramGb: number;
  storageGb: number;
  storageType: StorageType;
  cpu: string;
  gpu?: string;
  usageTags: string[];
  description: string;
  imageUrls: string[];
};

const products: SeedProduct[] = [
  {
    brand: "HP",
    model: "Pavilion 15",
    price: 55000,
    ramGb: 8,
    storageGb: 256,
    storageType: StorageType.SSD,
    cpu: "Intel Core i5 12th Gen",
    gpu: "Intel Iris Xe",
    usageTags: ["STUDENT", "OFFICE", "DAILY_BROWSING"],
    description: "Balanced laptop for students and daily office use.",
    imageUrls: ["https://images.example.com/hp-pavilion-15-1.jpg"]
  },
  {
    brand: "Lenovo",
    model: "IdeaPad 3",
    price: 62000,
    ramGb: 8,
    storageGb: 512,
    storageType: StorageType.NVME,
    cpu: "AMD Ryzen 5 5500U",
    gpu: "AMD Radeon Graphics",
    usageTags: ["STUDENT", "CODING", "OFFICE"],
    description: "Good value option for coding and productivity.",
    imageUrls: ["https://images.example.com/lenovo-ideapad-3-1.jpg"]
  },
  {
    brand: "Dell",
    model: "Inspiron 15 3520",
    price: 79000,
    ramGb: 16,
    storageGb: 512,
    storageType: StorageType.SSD,
    cpu: "Intel Core i7 12th Gen",
    gpu: "Intel Iris Xe",
    usageTags: ["OFFICE", "CODING", "READING"],
    description: "Strong office and software development performance.",
    imageUrls: ["https://images.example.com/dell-inspiron-3520-1.jpg"]
  },
  {
    brand: "ASUS",
    model: "TUF Gaming F15",
    price: 118000,
    ramGb: 16,
    storageGb: 512,
    storageType: StorageType.NVME,
    cpu: "Intel Core i7 12th Gen",
    gpu: "NVIDIA RTX 3050",
    usageTags: ["GAMING", "DESIGN", "GRAPHICS_DESIGN"],
    description: "Entry gaming laptop for design and heavy graphics workloads.",
    imageUrls: ["https://images.example.com/asus-tuf-f15-1.jpg"]
  },
  {
    brand: "Acer",
    model: "Nitro 5",
    price: 128000,
    ramGb: 16,
    storageGb: 1024,
    storageType: StorageType.NVME,
    cpu: "AMD Ryzen 7 6800H",
    gpu: "NVIDIA RTX 3060",
    usageTags: ["GAMING", "GRAPHICS_DESIGN", "ARCHITECTURE"],
    description: "High-performance laptop for gaming and architectural design.",
    imageUrls: ["https://images.example.com/acer-nitro-5-1.jpg"]
  },
  {
    brand: "Apple",
    model: "MacBook Air M2",
    price: 130000,
    ramGb: 16,
    storageGb: 512,
    storageType: StorageType.SSD,
    cpu: "Apple M2",
    gpu: "Integrated 10-core GPU",
    usageTags: ["DESIGN", "CODING", "OFFICE"],
    description: "Premium thin-and-light option for creators and developers.",
    imageUrls: ["https://images.example.com/macbook-air-m2-1.jpg"]
  },
  {
    brand: "HP",
    model: "Victus 16",
    price: 102000,
    ramGb: 16,
    storageGb: 512,
    storageType: StorageType.SSD,
    cpu: "Intel Core i5 13th Gen",
    gpu: "NVIDIA RTX 2050",
    usageTags: ["GAMING", "CODING", "DESIGN"],
    description: "Versatile performance option with dedicated graphics.",
    imageUrls: ["https://images.example.com/hp-victus-16-1.jpg"]
  },
  {
    brand: "Lenovo",
    model: "ThinkPad E14",
    price: 86000,
    ramGb: 16,
    storageGb: 512,
    storageType: StorageType.NVME,
    cpu: "Intel Core i5 13th Gen",
    gpu: "Intel Iris Xe",
    usageTags: ["OFFICE", "CODING", "READING"],
    description: "Business-class laptop for reliability and long-term use.",
    imageUrls: ["https://images.example.com/thinkpad-e14-1.jpg"]
  },
  {
    brand: "Dell",
    model: "Vostro 3520",
    price: 69000,
    ramGb: 8,
    storageGb: 512,
    storageType: StorageType.SSD,
    cpu: "Intel Core i5 12th Gen",
    gpu: "Intel UHD",
    usageTags: ["OFFICE", "STUDENT", "DAILY_BROWSING"],
    description: "Affordable office machine with solid multitasking.",
    imageUrls: ["https://images.example.com/dell-vostro-3520-1.jpg"]
  },
  {
    brand: "MSI",
    model: "GF63 Thin",
    price: 98000,
    ramGb: 16,
    storageGb: 512,
    storageType: StorageType.NVME,
    cpu: "Intel Core i5 12th Gen",
    gpu: "NVIDIA GTX 1650",
    usageTags: ["GAMING", "CODING", "GRAPHICS_DESIGN"],
    description: "Budget-friendly gaming option for mixed workloads.",
    imageUrls: ["https://images.example.com/msi-gf63-thin-1.jpg"]
  }
];

async function main() {
  const adminUsername = (process.env.ADMIN_BOOTSTRAP_USERNAME ?? "admin").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "admin12345";
  const adminDisplayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME ?? "Administrator";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  for (const [index, entry] of BUDGET_RANGES.entries()) {
    await prisma.budgetOption.upsert({
      where: { key: entry.key },
      update: {
        label: entry.label,
        min: entry.min,
        max: entry.max,
        sortOrder: index,
        isActive: true
      },
      create: {
        key: entry.key,
        label: entry.label,
        min: entry.min,
        max: entry.max,
        sortOrder: index,
        isActive: true
      }
    });
  }

  for (const [index, entry] of RAM_OPTIONS.entries()) {
    await prisma.ramOption.upsert({
      where: { gb: entry.gb },
      update: {
        label: entry.label,
        sortOrder: index,
        isActive: true
      },
      create: {
        gb: entry.gb,
        label: entry.label,
        sortOrder: index,
        isActive: true
      }
    });
  }

  for (const [index, entry] of STORAGE_OPTIONS.entries()) {
    await prisma.storageOption.upsert({
      where: { gb: entry.gb },
      update: {
        label: entry.label,
        sortOrder: index,
        isActive: true
      },
      create: {
        gb: entry.gb,
        label: entry.label,
        sortOrder: index,
        isActive: true
      }
    });
  }

  for (const [index, entry] of DEFAULT_USAGE_OPTIONS.entries()) {
    await prisma.usageTagOption.upsert({
      where: { key: entry.key },
      update: {
        label: entry.label,
        sortOrder: index,
        isActive: true
      },
      create: {
        key: entry.key,
        label: entry.label,
        sortOrder: index,
        isActive: true
      }
    });
  }

  await prisma.adminUser.upsert({
    where: { username: adminUsername },
    update: {
      passwordHash,
      displayName: adminDisplayName,
      isActive: true
    },
    create: {
      username: adminUsername,
      passwordHash,
      displayName: adminDisplayName,
      isActive: true
    }
  });

  for (const product of products) {
    const existing = await prisma.product.findFirst({
      where: {
        brand: { equals: product.brand, mode: "insensitive" },
        model: { equals: product.model, mode: "insensitive" }
      },
      select: { id: true }
    });

    const payload = {
      price: product.price,
      ramGb: product.ramGb,
      storageGb: product.storageGb,
      storageType: product.storageType,
      cpu: product.cpu,
      gpu: product.gpu,
      usageTags: product.usageTags,
      description: product.description,
      isActive: true
    };

    const saved = existing
      ? await prisma.product.update({
          where: { id: existing.id },
          data: payload
        })
      : await prisma.product.create({
          data: {
            brand: product.brand,
            model: product.model,
            ...payload
          }
        });

    await prisma.productImage.deleteMany({ where: { productId: saved.id } });
    await prisma.productImage.createMany({
      data: product.imageUrls.map((url, index) => ({
        productId: saved.id,
        imageUrl: url,
        sortOrder: index
      }))
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed completed.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
