const preview = {
  parameters: {
    layout: "fullscreen",
    controls: {
      matchers: {
        color: /(background|color)$/i,
      },
    },
    backgrounds: {
      default: "paper",
      values: [
        { name: "paper", value: "#FAF9F5" },
        { name: "ink", value: "#1B1C1A" },
      ],
    },
    options: {
      storySort: {
        order: ["Tokens"],
      },
    },
  },
};

export default preview;
