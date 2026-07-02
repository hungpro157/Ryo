// utils/helpers.js — Hàm tiện ích dùng chung

/** Lấy phần tử ngẫu nhiên từ array */
export const rand  = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Sleep promise — await sleep(ms) để delay */
export const sleep = (ms)  => new Promise(r => setTimeout(r, ms));
