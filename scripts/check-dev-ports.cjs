const net = require('node:net')

const ports = [
  { port: Number(process.env.WEB_PORT || 3000), name: '前端' },
  { port: Number(process.env.READER_PORT || 3100), name: '阅读器' },
  { port: Number(process.env.PORT || 4000), name: '后端' },
]

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()

    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true))
    })
  })
}

async function main() {
  const occupied = []

  for (const item of ports) {
    const available = await checkPort(item.port)
    if (!available) occupied.push(item)
  }

  if (occupied.length === 0) return

  console.error('')
  console.error('[Hnovel] 启动前检查失败：以下端口已经被占用。')
  for (const item of occupied) {
    console.error(`[Hnovel] - ${item.name}端口 ${item.port}`)
  }
  console.error('')
  console.error('[Hnovel] 请先关闭旧的 start-dev.cmd、npm run app 或其他占用端口的开发服务。')
  console.error('[Hnovel] 如果不确定哪个窗口占用端口，直接重启电脑也可以一键清掉旧进程。')
  console.error('')
  process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
