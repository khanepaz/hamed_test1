exports.handler = async (event) => {
    console.log("========== BALE UPDATE ==========");
    console.log(event.body);

    return {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            ok: true,
            message: "Update received"
        })
    };
};
