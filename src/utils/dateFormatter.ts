// 格式化日期为 YYYY-MM-DD
export function formatDate(date: Date): string {
	const iso = date.toISOString();
	const parts = iso.split('T');
	return parts && parts[0] ? parts[0] : '';
}

// 格式化日期时间为 YYYY-MM-DD HH:MM
export function formatDateTime(date: Date): string {
	const datePart = formatDate(date);
	const timePart = formatTime(date);
	return `${datePart} ${timePart}`;
}

// 格式化时间为 HH:MM
export function formatTime(date: Date): string {
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	return `${hours}:${minutes}`;
}

// 格式化年月为 YYYYMM
export function formatYearMonth(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	return `${year}${month}`;
}

// 获取星期
export function getWeekday(date: Date): string {
	const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
	const day = date.getDay();
	return weekdays[day] || '';
}

// 解析文件名模板
export function parseFileNameTemplate(template: string, date: Date): string {
	const formattedDate = formatDate(date);
	const result = template
		.replace('{日期}', formattedDate)
		.replace('{年月}', formatYearMonth(date))
		.replace('{星期}', getWeekday(date));
	
	console.log(`[dateFormatter] 解析模板 - 模板：${template}, 日期：${formattedDate}, 结果：${result}`);
	
	return result;
}
