import { Plugin } from "@opencode/plugin"
import { calcTools } from "./calc"
import { portfolioTools } from "./portfolio"

export default Plugin.define({
  id: "fin-tools",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "fin-calc",
        description: "Financial math: NPV, CAGR, Sharpe, compounding, inflation, SWR, loan PMT",
      })
      editor.namespace({
        name: "portfolio-utils",
        description: "Portfolio allocation, diversification, rebalancing, returns",
      })
      for (const tool of [...calcTools, ...portfolioTools]) editor.add(tool)
    })
  },
})
