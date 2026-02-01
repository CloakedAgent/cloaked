export interface DocFrontmatter {
  title: string;
  description: string;
  order?: number;
}

export interface Doc {
  slug: string;
  frontmatter: DocFrontmatter;
  content: string;
}

export interface NavItem {
  title: string;
  href?: string;
  items?: NavItem[];
}
