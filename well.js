const {sqrt, pow, abs, atan, cos} = Math;
const x = 2, y = 3, z = 0, iter = 100;

for (let i = 1; i <= x * 20; i++) {
    const height = z + i / 40;
    const ans = calcWell(x, y, height, iter);
    console.log(`${height} \t ${ans}`);
}

function calcWell(stickA, stickB, height, iter) {
    let sum = 0, a = [];

    a[0] = -stickA * sqrt(1 - pow(height / stickA, 2));
    a[1] = stickB * sqrt(1 - pow(height / stickA, 2));
    sum = a[0] + a[1];

    for (let i = 2; i < iter; i++) {
        const length = ((i % 2) == 0) ? -stickA : stickB;
        const angle = atan(height / abs(sum));
        const deg = angle / Math.PI * 180;
        a[i] = length * cos(angle);
        sum += a[i];
    }

    return abs(sum - (sum - a[a.length - 1]));
    // return [sum, sum - a[a.length - 1]];
}