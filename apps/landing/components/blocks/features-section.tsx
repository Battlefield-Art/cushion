import { motion } from 'framer-motion';

type Feature = {
  title: string;
  description: string;
  image: string;
  chatImage?: string;
  chatWide?: boolean;
};

const features: Feature[] = [
  {
    title: 'PDF Viewer',
    description:
      'Read, highlight and annotate PDFs without leaving your workspace. Ask AI about the content and get instant summaries, explanations, and insights.',
    image: '/features/pdf-viewer.png',
    chatImage: '/features/pdf-chat.png',
  },
  {
    title: 'Diagrams',
    description:
      'Create beautiful diagrams with Excalidraw, right inside your notes. Let AI generate diagrams from a simple prompt. Flowcharts, architectures, and more.',
    image: '/features/diagrams.png',
    chatImage: '/features/diagrams-chat.png',
  },
  {
    title: 'Tools',
    description:
      'Extend your AI with skills and MCP servers. Connect to external services, run custom tools, and build workflows that fit the way you work.',
    image: '/features/tools.png',
    chatImage: '/features/tools-chat.png',
  },
  {
    title: 'Whisper',
    description:
      'Dictate your thoughts with local speech-to-text powered by Sherpa ONNX. Your voice stays on your machine. Fast, private, and always available offline.',
    image: '/features/whisper.png',
    chatImage: '/features/whisper-settings.png',
    chatWide: true,
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, bounce: 0.3, duration: 1.2 },
  },
};

export function FeaturesSection() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24 md:py-32">
      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-100px' }}
        transition={{ staggerChildren: 0.15 }}
        className="grid gap-6 md:grid-cols-2"
      >
        {features.map((feature) => (
          <motion.div
            key={feature.title}
            variants={cardVariants}
            className="group relative flex flex-col rounded-2xl border bg-secondary/50"
          >
            <div className="p-6 pb-0">
              <h3 className="text-2xl font-bold">{feature.title}</h3>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
            <div className="mt-auto pt-6 pl-8 overflow-hidden rounded-br-2xl">
              <img
                src={feature.image}
                alt={`${feature.title} feature preview`}
                className="w-full rounded-tl-xl object-cover object-top aspect-[16/10] shadow-lg"
              />
            </div>
            {feature.chatImage && (
              <img
                src={feature.chatImage}
                alt={`${feature.title} AI chat preview`}
                className={`absolute -bottom-8 -right-2 rounded-md shadow-2xl ring-1 ring-border ${feature.chatWide ? 'w-[24rem]' : 'w-52'}`}
              />
            )}
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-100px' }}
        variants={cardVariants}
        className="relative mt-16 mx-auto max-w-5xl rounded-2xl border bg-secondary/50"
      >
        <div className="p-8 pb-0 max-w-2xl">
          <h3 className="text-3xl font-bold">AI Review</h3>
          <p className="mt-3 text-lg text-muted-foreground leading-relaxed">
            Let AI suggest edits directly in your notes. Review diffs inline, accept or reject changes, all without leaving your editor.
          </p>
        </div>
        <div className="mt-6 pl-10 overflow-hidden rounded-br-2xl">
          <img
            src="/features/ai-review.png"
            alt="AI review diff preview"
            className="w-full rounded-tl-xl shadow-lg"
          />
        </div>
      </motion.div>
    </section>
  );
}
