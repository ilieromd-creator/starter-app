const apiKey = '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';

async function findWorkingModel() {
  const modelsRes = await fetch('https://integrate.api.nvidia.com/v1/models', {
    headers: { Authorization: 'Bearer ' + apiKey }
  });
  const { data } = await modelsRes.json();
  const modelIds = data.map(m => m.id);
  console.log('Total models:', modelIds.length);

  for (const m of modelIds.slice(0, 10)) {
    try {
      console.log('Trying:', m);
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: m,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 10
        })
      });
      if (res.status === 200) {
        const json = await res.json();
        console.log('SUCCESS with model:', m, json.choices?.[0]?.message?.content);
        return;
      } else {
        console.log('Status', res.status, m);
      }
    } catch (e) {
      console.log('Error', m, e.message);
    }
  }
}

findWorkingModel();
