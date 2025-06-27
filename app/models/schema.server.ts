import { createId } from "@paralleldrive/cuid2";
import { boolean, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accessToken: text("accessToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshToken: text("refreshToken"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  password: text("password"),
  scope: text("scope"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().default(""),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const genderEnum = pgEnum("gender", ["bul", "vers", "os", 'koei']);

export const cattle = pgTable("cattle", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  tag_number: text("tag_number").notNull().unique(),
  gender: genderEnum("gender").notNull(),
  breed: text("breed").notNull().default(""),
  mass: integer("mass").notNull().default(0),
  receivedAt: timestamp("receivedAt").notNull().defaultNow(),
  receivedAge: integer("receivedAge").notNull().default(0), //Months
});

export const treatment = pgTable("treatment", {
  id: text("id")
    .$defaultFn(() => createId())
    .primaryKey(),
  cattleId: text("cattleId")
    .notNull()
    .references(() => cattle.id, { onDelete: "cascade" }),
  treatment: text("treatment").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  followUp: timestamp("followUp"),
  completed: boolean("completed").notNull().default(false),
});