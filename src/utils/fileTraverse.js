// 递归读取文件/文件夹
export const traverseFileTree = async (entry) => {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => {
        if (file && (file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|avif|bmp|ico|gif|svg)$/i.test(file.name))) {
          resolve([file])
        } else {
          resolve([])
        }
      }, () => resolve([]))
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader()
      let allFiles = []
      const readEntries = () => {
        dirReader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(allFiles)
          } else {
            const entryPromises = entries.map((e) => traverseFileTree(e))
            const results = await Promise.all(entryPromises)
            results.forEach((files) => { allFiles = allFiles.concat(files) })
            readEntries()
          }
        }, () => resolve(allFiles))
      }
      readEntries()
    } else {
      resolve([])
    }
  })
}
