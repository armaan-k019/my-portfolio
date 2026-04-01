import ArchProjectLayout from '@/components/ArchProjectLayout';
import type { ArchProjectContent } from '@/components/ArchProjectLayout';

const content: ArchProjectContent = {
  title: 'Framed',
  meta: '',
  priori: '',
  siteImages: [
    { src: '', caption: '' },
    { src: '', caption: '' },
  ],
  contextText: '',
  drawings: [
    { src: '', caption: '' },
    { src: '', caption: '' },
    { src: '', caption: '' },
    { src: '', caption: '' },
  ],
  finalThoughts: '',
};

export default function FramedPage() {
  return <ArchProjectLayout content={content} />;
}
