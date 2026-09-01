const apiKey = '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';

async function testSpecificList() {
  const list = [
    'meta/llama-3.1-70b-instruct',
    'meta/llama-3.1-8b-instruct',
    'deepseek-ai/deepseek-r1',
    'deepseek-ai/deepseek-v3',
    'qwen/qwen2.5-72b-instruct',
    'nvidia/llama-3.1-nemotron-70b-instruct',
    'nvidia/nemotron-4-340b-instruct',
    'mistralai/mistral-large-2407',
    'mistralai/mixtral-8x7b-instruct-v0.1'
  ];

  for (const model of list) {
    const start = Date.now();
    try {
      const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 10
        })
      });
      const data = await res.json();
      console.log(model, '-> Status:', res.status, 'Time:', Date.now() - start, 'ms', data.choices?.[0]?.message?.content || data.detail || data.message || '');
      if (res.status === 200) {
        console.log('>>> SUCCESS ACTIVE MODEL FOUND:', model);
        return;
      }
    } catch (e) {
      console.log(model, '-> error:', e.message);
    }
  }
}

testSpecificList();
