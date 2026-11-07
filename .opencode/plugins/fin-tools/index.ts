import { Plugin } from "@opencode/plugin"
import { calcTools } from "./calc"
import { portfolioTools } from "./portfolio"
import { makeSnapshotTool } from "./snapshot"

export default Plugin.define({
  id: "fin-tools",
  async setup(ctx) {
    const snapshot = makeSnapshotTool(ctx.location.directory)

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "fin-calc",
        description: "Financial math: NPV, CAGR, Sharpe, compounding, inflation, SWR, loan PMT",
      })
      editor.namespace({
        name: "portfolio-utils",
        description: "Portfolio allocation, diversification, rebalancing, returns",
      })
      editor.namespace({
        name: "fin-data",
        description: "Member data digest with deterministic owner resolution",
      })
      for (const tool of [...calcTools, ...portfolioTools, snapshot]) editor.add(tool)
    })
  },
})
