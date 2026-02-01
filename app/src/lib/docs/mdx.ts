import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { Doc, DocFrontmatter } from "./types";

const DOCS_PATH = path.join(process.cwd(), "src/content/docs");

export function getDocBySlug(slug: string): Doc | null {
  // Handle both "introduction" and "introduction/why-cloaked" style slugs
  const slugPath = slug.replace(/\/$/, "");

  // Try direct path first (e.g., quickstart.mdx)
  let filePath = path.join(DOCS_PATH, `${slugPath}.mdx`);

  // If not found, try index.mdx in directory (e.g., introduction/index.mdx)
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DOCS_PATH, slugPath, "index.mdx");
  }

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const fileContents = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(fileContents);

  return {
    slug: slugPath,
    frontmatter: data as DocFrontmatter,
    content,
  };
}
