interface Props {
  active?: boolean;
  css?: string;
}

export default function CompanyThemeStyle({ active, css }: Props) {
  if (!active || !css) return null;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
