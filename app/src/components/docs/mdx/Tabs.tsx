"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { memo, ComponentPropsWithoutRef } from "react";

export const Tabs = memo(function Tabs({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root className={`docs-tabs ${className}`} {...props} />
  );
});

export const TabsList = memo(function TabsList({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List className={`docs-tabs-list ${className}`} {...props} />
  );
});

export const TabsTrigger = memo(function TabsTrigger({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={`docs-tabs-trigger ${className}`}
      {...props}
    />
  );
});

export const TabsContent = memo(function TabsContent({
  className = "",
  ...props
}: ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={`docs-tabs-content ${className}`}
      {...props}
    />
  );
});
