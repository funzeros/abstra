(() => {
  const app = createApp([
    {
      name: "test-comp",
      setup() {
        const count = ref(0);
        const double = computed(() => count.value * 2);
        const state = reactive({
          text: "hello",
          obj: {
            a: 1,
            b: 2,
          },
          arr: [1, 2, 3],
        });
        return {
          count,
          double,
          addCount: () => {
            count.value++;
          },
          state,
          changeState: () => {
            state.text = Math.random().toFixed(2);
            state.obj.a++;
            state.obj.b--;
            state.arr.push(Math.random().toFixed(2) * 100);
          },
        };
      },
    },
  ]);
  app.mount("#app");
})();
// function main() {
//   // 渲染上下文
//   const ctx = setup();
//   // 模板渲染，事件绑定
//   const app = document.querySelector("#app");
//   window.changeState = ctx.changeState;
//   window.addCount = ctx.addCount;
//   effect(() => {
//     app.innerHTML = `
//     <p><button onclick="changeState()">change</button></p>
//     <p>state: ${JSON.stringify(ctx.state)}</p>
//     <p><button onclick="addCount()">count: ${ctx.count.value}</button></p>
//     <p>double: ${ctx.double.value}</p>
//     `;
//   });
// }
