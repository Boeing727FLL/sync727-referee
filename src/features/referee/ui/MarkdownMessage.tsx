/** Markdown renderer loaded only after the first referee answer. */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = React.ComponentProps<typeof ReactMarkdown>;

export default function MarkdownMessage(props: Props) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} {...props} />;
}
