import os

path = r'd:\code\projects\active\FilePilot\frontend\src\app\history\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

def replace_lines(start_1_idx, end_1_idx, new_lines_list):
    # start_1_idx and end_1_idx are 1-indexed (like view_file)
    lines[start_1_idx-1:end_1_idx] = [l + '\n' if not l.endswith('\n') else l for l in new_lines_list]

# 5. Detail Stats & Cards Flattening (507-557)
# This includes the rollback success alert, the 3 stats, and the header of the change list.
replace_lines(507, 568, [
    '                    <div className="space-y-6">',
    '                      {rollbackSuccess ? (',
    '                        <motion.div',
    '                          initial={{ opacity: 0, scale: 0.98 }}',
    '                          animate={{ opacity: 1, scale: 1 }}',
    '                          className="rounded-[8px] bg-success/5 border border-success/10 p-4"',
    '                        >',
    '                          <div className="flex items-start gap-3">',
    '                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10 text-success-dim">',
    '                              <Undo2 className="h-4 w-4" />',
    '                            </div>',
    '                            <div className="space-y-1">',
    '                              <h3 className="text-[14px] font-black text-on-surface">回滚成功</h3>',
    '                              <p className="text-[12px] font-medium text-ui-muted opacity-70">',
    '                                受影响的 {journal?.item_count || 0} 项内容已完成路径恢复。',
    '                              </p>',
    '                            </div>',
    '                          </div>',
    '                        </motion.div>',
    '                      ) : null}',
    '',
    '                      <div className="flex divide-x divide-on-surface/8 border-y border-on-surface/8 py-5 px-1">',
    '                        <div className="flex-1 px-4 space-y-1">',
    '                          <p className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-60">处理条目</p>',
    '                          <p className="text-[20px] font-black tracking-tight text-on-surface tabular-nums leading-none">',
    '                            {journal?.item_count || 0}',
    '                          </p>',
    '                        </div>',
    '                        <div className="flex-1 px-4 space-y-1">',
    '                          <p className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-60">成功项目</p>',
    '                          <p className="text-[20px] font-black tracking-tight text-on-surface tabular-nums leading-none">',
    '                            {journal?.success_count || 0}',
    '                          </p>',
    '                        </div>',
    '                        <div className="flex-1 px-4 space-y-1">',
    '                          <p className="text-[10px] font-bold uppercase tracking-wider text-ui-muted opacity-60">失败项目</p>',
    '                          <p className="text-[20px] font-black tracking-tight text-on-surface tabular-nums leading-none">',
    '                            {journal?.failure_count || 0}',
    '                          </p>',
    '                        </div>',
    '                      </div>',
    '',
    '                      <div className="px-1">',
    '                        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">',
    '                          <div className="space-y-1">',
    '                            <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.1em] text-primary/45">',
    '                              <Activity className="h-3 w-3" />',
    '                              JOURNAL DETAIL',
    '                            </div>',
    '                            <h3 className="text-[15px] font-black text-on-surface">变更执行明细</h3>',
    '                          </div>',
    '',
    '                          {!rollbackSuccess && journal?.status === "completed" ? (',
    '                            <Button',
    '                              variant="danger"',
    '                              onClick={() => setRollbackConfirmOpen(true)}',
    '                              disabled={actionLoading}',
    '                              loading={actionLoading}',
    '                              className="h-9 px-6 rounded-full text-[12px] font-black"',
    '                            >',
    '                              <Undo2 className="h-3.5 w-3.5" />',
    '                              回退执行',
    '                            </Button>',
    '                          ) : null}',
    '                        </div>'
])

# 6. Table & Container Flattening (575-583)
# We remove the rounded card around the table.
replace_lines(575, 583, [
    '                        <div className="mt-6 border-t border-on-surface/8">',
    '                          <table className="w-full border-collapse text-left">',
    '                            <thead className="border-b border-on-surface/6">',
    '                              <tr className="text-[11px] font-bold uppercase tracking-wider text-ui-muted/50">',
    '                                <th className="px-4 py-4">文件名称</th>',
    '                                <th className="px-4 py-4 text-right">路径映射 (TO / FROM)</th>',
    '                              </tr>',
    '                            </thead>',
    '                            <tbody className="divide-y divide-on-surface/6 opacity-90">'
])

# 7. Table Cell Tweak (595-597)
replace_lines(587, 587, [
    '                                    <td className="px-4 py-4 align-top">'
])
replace_lines(595, 595, [
    '                                    <td className="px-4 py-4">' # Corrected alignment
])

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
