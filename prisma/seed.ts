import "dotenv/config";
import bcrypt from "bcryptjs";
import { StorageType, UsageTag } from "@prisma/client";
import { prisma } from "../src/prisma";

type SeedProduct = {
  brand: string;
  model: string;
  price: number;
  ramGb: number;
  storageGb: number;
  storageType: StorageType;
  cpu: string;
  gpu?: string;
  usageTags: UsageTag[];
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
    usageTags: [UsageTag.STUDENT, UsageTag.OFFICE, UsageTag.DAILY_BROWSING],
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
    usageTags: [UsageTag.STUDENT, UsageTag.CODING, UsageTag.OFFICE],
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
    usageTags: [UsageTag.OFFICE, UsageTag.CODING, UsageTag.READING],
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
    usageTags: [UsageTag.GAMING, UsageTag.DESIGN, UsageTag.GRAPHICS_DESIGN],
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
    usageTags: [UsageTag.GAMING, UsageTag.GRAPHICS_DESIGN, UsageTag.ARCHITECTURE],
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
    usageTags: [UsageTag.DESIGN, UsageTag.CODING, UsageTag.OFFICE],
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
    usageTags: [UsageTag.GAMING, UsageTag.CODING, UsageTag.DESIGN],
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
    usageTags: [UsageTag.OFFICE, UsageTag.CODING, UsageTag.READING],
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
    usageTags: [UsageTag.OFFICE, UsageTag.STUDENT, UsageTag.DAILY_BROWSING],
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
    usageTags: [UsageTag.GAMING, UsageTag.CODING, UsageTag.GRAPHICS_DESIGN],
    description: "Budget-friendly gaming option for mixed workloads.",
    imageUrls: ["https://images.example.com/msi-gf63-thin-1.jpg"]
  }
];

async function main() {
  const adminUsername = (process.env.ADMIN_BOOTSTRAP_USERNAME ?? "admin").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "admin12345";
  const adminDisplayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME ?? "Administrator";
  const passwordHash = await bcrypt.hash(adminPassword, 10);

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
    const created = await prisma.product.upsert({
      where: {
        brand_model: {
          brand: product.brand,
          model: product.model
        }
      },
      update: {
        price: product.price,
        ramGb: product.ramGb,
        storageGb: product.storageGb,
        storageType: product.storageType,
        cpu: product.cpu,
        gpu: product.gpu,
        usageTags: product.usageTags,
        description: product.description,
        isActive: true
      },
      create: {
        brand: product.brand,
        model: product.model,
        price: product.price,
        ramGb: product.ramGb,
        storageGb: product.storageGb,
        storageType: product.storageType,
        cpu: product.cpu,
        gpu: product.gpu,
        usageTags: product.usageTags,
        description: product.description,
        images: {
          create: product.imageUrls.map((url, index) => ({
            imageUrl: url,
            sortOrder: index
          }))
        }
      }
    });

    await prisma.productImage.deleteMany({ where: { productId: created.id } });
    await prisma.productImage.createMany({
      data: product.imageUrls.map((url, index) => ({
        productId: created.id,
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
