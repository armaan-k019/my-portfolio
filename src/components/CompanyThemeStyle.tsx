"use client";

interface Props {
  active: boolean;
  css: string;
}

export default function CompanyThemeStyle({ active, css }: Props) {
  if (!active) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
