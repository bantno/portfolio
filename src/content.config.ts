import { defineCollection, z } from "astro:content";

/**
 * Project content collection schema.
 *
 * To add a new project, create a new .yaml file in src/content/projects/.
 * The filename becomes the slug (e.g., "seaplane.yaml" → slug "seaplane").
 * All fields below are validated at build time by Zod.
 */
const projects = defineCollection({
  type: "data",
  schema: z.object({
    // ── Core fields ──────────────────────────────────────────────
    title: z.string(),
    status: z.enum(["Active", "Complete", "In Development"]),
    domain: z.string(),
    description: z.string().describe("One-sentence project summary"),
    tags: z.array(z.string()),
    order: z.number().describe("Display order — lower numbers appear first"),

    // ── Metrics ──────────────────────────────────────────────────
    // 2-3 key performance indicators shown on the card
    metrics: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        })
      )
      .min(2)
      .max(3),

    // ── Optional media & links ───────────────────────────────────
    // photo: path to an image in public/images/ (e.g., "images/chonki.jpg")
    photo: z.string().optional(),
    // video: YouTube or direct video URL
    video: z.string().url().optional(),
    // cad_embed: Onshape/GrabCAD embed URL for interactive 3D viewer
    cad_embed: z.string().url().optional(),
    // paper_url: link to published paper PDF or DOI
    paper_url: z.string().url().optional(),
    // conference: conference name and year
    conference: z.string().optional(),
  }),
});

export const collections = { projects };
