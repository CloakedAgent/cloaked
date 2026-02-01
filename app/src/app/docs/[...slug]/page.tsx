import { notFound } from "next/navigation";
import { Metadata } from "next";
import { getDocBySlug } from "@/lib/docs/mdx";
import { getAllDocSlugs, getPrevNext } from "@/lib/docs/navigation";
import { DocsPagination } from "@/components/docs";
import { DocsContent } from "./DocsContent";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export async function generateStaticParams() {
  const slugs = getAllDocSlugs();
  return slugs.map((slug) => ({
    slug: slug.split("/"),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const doc = getDocBySlug(slugPath);

  if (!doc) {
    return { title: "Not Found | Cloaked Docs" };
  }

  return {
    title: `${doc.frontmatter.title} | Cloaked Docs`,
    description: doc.frontmatter.description,
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const slugPath = slug.join("/");
  const doc = getDocBySlug(slugPath);

  if (!doc) {
    notFound();
  }

  const { prev, next } = getPrevNext(slugPath);

  return (
    <article className="docs-content">
      <header className="docs-content-header">
        <h1>{doc.frontmatter.title}</h1>
        {doc.frontmatter.description && (
          <p className="docs-content-description">
            {doc.frontmatter.description}
          </p>
        )}
      </header>

      <DocsContent slug={slugPath} />

      <DocsPagination prev={prev} next={next} />
    </article>
  );
}
