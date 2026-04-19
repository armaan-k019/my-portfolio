import ArchProjectLayout from '@/components/ArchProjectLayout';
import type { ArchProjectContent } from '@/components/ArchProjectLayout';

const content: ArchProjectContent = {
  title: 'Guest People',
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
  posteriori: {
    text: '',
    images: [
      { src: '', caption: '' },
      { src: '', caption: '' },
    ],
  },
};

export default function EdoCommonsPage() {
  return <ArchProjectLayout content={content} />;
}
