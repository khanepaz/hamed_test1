exports.handler = async (event) => {
    console.log("========== BALE WEBHOOK ==========");
    console.log("METHOD:", event.httpMethod);
    console.log("HEADERS:", event.headers);
    console.log("BODY:", event.body);

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ok: true,
            message: "Webhook received"
        })
    };
};
