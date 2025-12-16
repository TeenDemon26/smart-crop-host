function calculateFertilizer() {
    // 1. Get Values from the HTML Inputs
    const nPercent = parseFloat(document.getElementById('n-percent').value);
    const pPercent = parseFloat(document.getElementById('p-percent').value);
    const kPercent = parseFloat(document.getElementById('k-percent').value);
    const targetNRate = parseFloat(document.getElementById('target-n-rate').value);
    const areaSize = parseFloat(document.getElementById('area-size').value);
    const resultDiv = document.getElementById('result');

    // 2. Validate Inputs
    if (isNaN(nPercent) || nPercent <= 0 || 
        isNaN(pPercent) || isNaN(kPercent) || 
        isNaN(targetNRate) || targetNRate <= 0 || 
        isNaN(areaSize) || areaSize <= 0) {
        resultDiv.innerHTML = "❌ Please enter valid, positive numbers for all fields (Nitrogen percentage and rates must be > 0).";
        return;
    }

    // 3. Perform Calculations
    
    // Convert percentages to decimal
    const nDecimal = nPercent / 100.0;
    const pDecimal = pPercent / 100.0; 
    const kDecimal = kPercent / 100.0; 
    
    // Check to prevent division by zero for N
    if (nDecimal <= 0) {
        resultDiv.innerHTML = "❌ Nitrogen percentage must be greater than zero to calculate the product rate.";
        return;
    }
        
    // A. Calculate the product needed based *only* on the Nitrogen target
    
    // 1. Product needed per 100 m²
    // Formula: kg Product / 100 m² = Target N kg / N % (decimal)
    const productPer100 = targetNRate / nDecimal; 

    // 2. Total product needed for the entire area (kg)
    // Formula: Total Product kg = (Area m² / 100) * Product / 100 m²
    const totalProduct = (areaSize / 100) * productPer100;

    // B. Calculate the actual amount of N, P, and K applied
    
    // Total N applied (kg) - Should equal target
    const totalNApplied = totalProduct * nDecimal;

    // Total P2O5 applied (kg)
    // Formula: P2O5 Applied kg = Total Product kg * P % (decimal)
    const totalPApplied = totalProduct * pDecimal;

    // Total K2O applied (kg)
    // Formula: K2O Applied kg = Total Product kg * K % (decimal)
    const totalKApplied = totalProduct * kDecimal;
    
    // 4. Format and Display Results 
    const htmlResult = `
        <p style="font-size: 1.1em; color: #90ee90;">
            Fertilizer needed per 100 m²: <strong>${productPer100.toFixed(3)} kg</strong>
        </p>
        
        <p style="font-size: 1.2em;">
            Total Product for ${areaSize.toLocaleString()} m²: 
            <strong style="color: #90ee90;">${totalProduct.toFixed(2)} kg</strong>
        </p>
        
        <hr style="border-top: 1px dashed #555; width: 80%; margin: 15px 0;">

        <p>
            You are applying the following nutrients:
        </p>
        <p>
            N (Nitrogen): <strong>${totalNApplied.toFixed(2)} kg</strong><br>
            P2O5 (Phosphate): <strong>${totalPApplied.toFixed(2)} kg</strong><br>
            K2O (Potash): <strong>${totalKApplied.toFixed(2)} kg</strong>
        </p>
    `;

    resultDiv.innerHTML = htmlResult;
}