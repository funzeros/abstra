(() => {
  const app = createApp();
  app.mount("#app");
  app.container = {
    header: {
      text: "wow",
      style: {
        "font-size": "16px",
      },
    },
  };
  console.log(app.container);
})();
