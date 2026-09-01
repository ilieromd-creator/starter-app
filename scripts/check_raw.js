const apiKey = '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';

async function checkRawResponse(model) {
  console.log('Testing raw response for:', model);
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Say Hello in one word' }],
      max_tokens: 20
    })
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Body:', text.slice(0, 300));
}

checkRawResponse('deepseek-ai/deepseek-r1');
