const units = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const unitsFemale = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

function getEnding(num: number, form1: string, form2: string, form5: string): string {
    const n = Math.abs(num) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return form5;
    if (n1 > 1 && n1 < 5) return form2;
    if (n1 === 1) return form1;
    return form5;
}

function getTens(num: number, female: boolean = false): string {
    if (num < 10) return (female ? unitsFemale[num] : units[num]);
    if (num >= 10 && num < 20) return teens[num - 10];
    const ten = Math.floor(num / 10);
    const unit = num % 10;
    return (tens[ten] + ' ' + (unit > 0 ? (female ? unitsFemale[unit] : units[unit]) : '')).trim();
}

function getHundreds(num: number, female: boolean = false): string {
    const hundred = Math.floor(num / 100);
    const rest = num % 100;
    return (hundreds[hundred] + (rest > 0 ? ' ' + getTens(rest, female) : '')).trim();
}

export function numberToWordsRu(num: number): string {
    if (num === 0) return 'Ноль рублей 00 копеек';
    
    const rubles = Math.floor(num);
    const kopecks = Math.round((num - rubles) * 100);
    
    let result = '';
    let temp = rubles;
    
    const billions = Math.floor(temp / 1000000000);
    temp %= 1000000000;
    const millions = Math.floor(temp / 1000000);
    temp %= 1000000;
    const thousands = Math.floor(temp / 1000);
    const ones = temp % 1000;
    
    if (billions > 0) {
        result += getHundreds(billions) + ' миллиард' + getEnding(billions, '', 'а', 'ов') + ' ';
    }
    if (millions > 0) {
        result += getHundreds(millions) + ' миллион' + getEnding(millions, '', 'а', 'ов') + ' ';
    }
    if (thousands > 0) {
        result += getHundreds(thousands, true) + ' тысяч' + getEnding(thousands, 'а', 'и', '') + ' ';
    }
    if (ones > 0 || rubles === 0) {
        result += getHundreds(ones) + ' ';
    }
    
    result += 'рубл' + getEnding(rubles, 'ь', 'я', 'ей') + ' ';
    result += kopecks.toString().padStart(2, '0') + ' копе' + getEnding(kopecks, 'йка', 'йки', 'ек');
    
    result = result.trim();
    return result.charAt(0).toUpperCase() + result.slice(1);
}
