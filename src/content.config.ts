import { defineCollection, z } from "astro:content";

const projects = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    status: z.enum(["Active", "Complete", "In Development"]),
    domain: z.string(),
    tags: z.array(z.string()),
    order: z.number(),
    tier: z.enum(["flagship", "featured", "standard", "brief"]),
    featured: z.boolean().default(false),
    date_range: z.string(),
    hero_image: z.string().optional(),
    metrics: z
      .array(z.object({ label: z.string(), value: z.string() }))
      .min(2)
      .max(3),
    video: z.string().url().optional(),
    cad_embed: z.string().url().optional(),
    paper_url: z.string().url().optional(),
    conference: z.string().optional(),
  }),
});

export const collections = { projects };
