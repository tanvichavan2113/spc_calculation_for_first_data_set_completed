import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

class SPCResultPage2 extends StatelessWidget {
  const SPCResultPage2({Key? key});

  get selectedSampleSize => null;

  Future<List<dynamic>> fetchData(String sampleSize) async {
    final res = await http.post(
      Uri.parse('http://localhost:3001/calculate-spc'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'sampleSize': sampleSize}),
    );

    if (res.statusCode == 200) {
      return jsonDecode(res.body);
    } else {
      throw Exception('Failed to load data');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SPC Result App2'),
      ),
      body: FutureBuilder(
        future: fetchData(
            "2"), // Pass the selected sample size
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          } else if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          } else {
            // Display your data using snapshot.data
            List<dynamic> data = snapshot.data as List<dynamic>;

            return ListView.builder(
              itemCount: 1,
              itemBuilder: (context, index) {
                return ListTile(
                  title: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('X bar: ${data[index]['xbar']}'),
                      Text('Stdev Overall ${data[index]['sd']}'),
                      Text('Pp: ${data[index]['pp']}'),
                      Text('Ppu: ${data[index]['ppu']}'),
                      Text('Ppl: ${data[index]['ppl']}'),
                      Text('Ppk: ${data[index]['ppk']}'),
                      Text('Rbar: ${data[index]['rbar']}'),
                      Text('Stdev Within: ${data[index]['sdw']}'),
                      Text('Cp: ${data[index]['cp']}'),
                      Text('Cpu: ${data[index]['cpu']}'),
                      Text('Cpl: ${data[index]['cpl']}'),
                      Text('Cpk: ${data[index]['cpk']}'),
                      Text('ucl: ${data[index]['ucl']}'),
                      Text('lcl: ${data[index]['lcl']}'),
                    ],
                  ),
                );
              },
            );
          }
        },
      ),
    );
  }
}
