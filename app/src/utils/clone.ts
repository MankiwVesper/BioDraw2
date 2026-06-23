// 通用深拷贝：基于 JSON 序列化，仅适用于纯 JSON 可序列化的数据。
// 与既有用法语义一致：会丢弃 undefined / 函数等非 JSON 值。
export const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value));
