import { Catalog, MongoDocument } from "../../catalog";

type TestDocument = MongoDocument<{
  _id: number;
  name: string;
  tags: string[];
  permissions: string[];
  scores: Array<{
    subject: string;
    score: number;
  }>;
  products: Array<{
    category: string;
    name: string;
    price: number;
    inStock: boolean;
  }>;
  transactions: Array<{
    type: string;
    amount: number;
    date: Date;
  }>;
  nested: {
    tags: string[];
  };
  emptyArray: any[];
  mixedArray: any[];
}>;

export const array: Catalog<TestDocument> = {
  operations: [
    // $all - Contains all elements
    { tags: { $all: ["javascript", "nodejs"] } },
    { permissions: { $all: ["read", "write"] } },
    { scores: { $all: [80, 90] } },

    // $all with nested arrays
    { "nested.tags": { $all: ["frontend", "backend"] } },

    // $elemMatch - Element matches all conditions
    {
      products: {
        $elemMatch: {
          category: "electronics",
          price: { $gt: 500 },
        },
      },
    },
    {
      scores: {
        $elemMatch: {
          subject: "math",
          score: { $gte: 85 },
        },
      },
    },
    {
      transactions: {
        $elemMatch: {
          type: "purchase",
          amount: { $lt: 100 },
          date: { $gte: new Date("2023-01-01") },
        },
      },
    },

    // $size - Array size
    { tags: { $size: 3 } },
    { permissions: { $size: 2 } },
    { scores: { $size: 4 } },
    { emptyArray: { $size: 0 } },

    // Complex combinations
    {
      $and: [
        { tags: { $all: ["javascript"] } },
        { tags: { $size: { $gte: 2 } } },
      ],
    },
    {
      $or: [
        { scores: { $elemMatch: { score: { $gte: 90 } } } },
        { permissions: { $all: ["admin"] } },
      ],
    },

    // Error cases
    { tags: { $all: "javascript" } }, // String instead of array
    { permissions: { $elemMatch: "invalid" } }, // Invalid condition
    { scores: { $size: -1 } }, // Negative size
    { scores: { $size: 3.5 } }, // Non-integer size
    { nonExistent: { $size: 0 } }, // Field doesn't exist
    { mixedArray: { $elemMatch: { score: { $gt: "high" } } } }, // Type mismatch

    // Edge cases
    { tags: { $all: [] } }, // Empty array - should match all
    { tags: { $all: ["nonexistent"] } }, // Non-existent element
    { scores: { $elemMatch: {} } }, // Empty condition
    { scores: { $size: 100 } }, // Size larger than any actual array
  ],
  collection: {
    indices: {
      tags: 1,
      permissions: 1,
      scores: 1,
      products: 1,
      transactions: 1,
    },
    records: [
      {
        _id: 1,
        name: "Alice",
        tags: ["javascript", "nodejs", "mongodb"],
        permissions: ["read", "write", "execute"],
        scores: [
          { subject: "math", score: 92 },
          { subject: "science", score: 88 },
          { subject: "english", score: 85 },
          { subject: "history", score: 90 },
        ],
        products: [
          {
            category: "electronics",
            name: "Laptop",
            price: 1200,
            inStock: true,
          },
          {
            category: "books",
            name: "Programming Guide",
            price: 45,
            inStock: true,
          },
        ],
        transactions: [
          { type: "purchase", amount: 1200, date: new Date("2023-06-15") },
          { type: "refund", amount: 50, date: new Date("2023-07-01") },
        ],
        nested: {
          tags: ["frontend", "backend", "fullstack"],
        },
        emptyArray: [],
        mixedArray: [1, "mixed", null, { nested: true }],
      },
      {
        _id: 2,
        name: "Bob",
        tags: ["python", "django"],
        permissions: ["read"],
        scores: [
          { subject: "math", score: 78 },
          { subject: "science", score: 82 },
        ],
        products: [
          {
            category: "books",
            name: "Python Cookbook",
            price: 35,
            inStock: true,
          },
        ],
        transactions: [
          { type: "purchase", amount: 35, date: new Date("2023-05-20") },
        ],
        nested: {
          tags: ["backend"],
        },
        emptyArray: [],
        mixedArray: ["python", null, 42],
      },
      {
        _id: 3,
        name: "Charlie",
        tags: ["typescript", "react", "nodejs", "mongodb"],
        permissions: ["read", "write"],
        scores: [
          { subject: "math", score: 95 },
          { subject: "science", score: 89 },
          { subject: "english", score: 91 },
          { subject: "history", score: 87 },
        ],
        products: [
          {
            category: "electronics",
            name: "Smartphone",
            price: 800,
            inStock: true,
          },
          {
            category: "electronics",
            name: "Tablet",
            price: 300,
            inStock: false,
          },
          {
            category: "books",
            name: "TypeScript Handbook",
            price: 25,
            inStock: true,
          },
        ],
        transactions: [
          { type: "purchase", amount: 800, date: new Date("2023-07-10") },
          { type: "purchase", amount: 25, date: new Date("2023-07-12") },
          { type: "refund", amount: 300, date: new Date("2023-07-15") },
        ],
        nested: {
          tags: ["frontend", "backend"],
        },
        emptyArray: [],
        mixedArray: [true, "string", { complex: { nested: true } }],
      },
      {
        _id: 4,
        name: "Diana",
        tags: ["python", "machine-learning", "data-science"],
        permissions: ["admin", "read", "write", "execute"],
        scores: [
          { subject: "math", score: 88 },
          { subject: "science", score: 94 },
          { subject: "english", score: 76 },
        ],
        products: [],
        transactions: [],
        nested: {
          tags: ["data"],
        },
        emptyArray: [],
        mixedArray: [null, undefined, "data"],
      },
      {
        _id: 5,
        name: "Eve",
        tags: ["security"],
        permissions: [],
        scores: [
          { subject: "math", score: 65 },
          { subject: "science", score: 72 },
        ],
        products: [
          {
            category: "electronics",
            name: "Security Camera",
            price: 200,
            inStock: true,
          },
        ],
        transactions: [
          { type: "purchase", amount: 200, date: new Date("2023-04-05") },
        ],
        nested: {
          tags: [],
        },
        emptyArray: [],
        mixedArray: ["only", "strings"],
      },
    ],
  },
};
