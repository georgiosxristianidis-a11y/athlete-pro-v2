export const PlateCalc = {
  calculate: (weight, barWeight = 20) => {
    const plates = [25, 20, 15, 10, 5, 2.5, 1.25];
    let remaining = (weight - barWeight) / 2;
    const result = {};
    
    for (const plate of plates) {
      if (remaining >= plate) {
        const count = Math.floor(remaining / plate);
        result[plate] = count;
        remaining -= count * plate;
      }
    }
    return result;
  }
};
