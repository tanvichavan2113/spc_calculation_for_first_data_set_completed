import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class SPCResultPage extends StatefulWidget {
  const SPCResultPage({Key? key}) : super(key: key);

  @override
  State<SPCResultPage> createState() => _SPCResultPageState();
}

class _SPCResultPageState extends State<SPCResultPage> {
  String? selectedOption = "";

  Future<List<Map<String, dynamic>>> fetchData(String selectedOption) async {
    try {
      final response = await http.post(
        Uri.parse('http://localhost:3001/calculate'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'selectedOption': selectedOption}),
      );

      print('API Response: ${response.body}');

      if (response.statusCode == 200) {
        return [jsonDecode(response.body)];
      } else {
        return [
          {'error': 'Failed to load data'}
        ];
      }
    } catch (error) {
      print('Exception: $error');
      return [
        {'error': 'An error occurred during data fetching'}
      ];
    }
  }

  @override
  void initState() {
    super.initState();
    _getData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SPC Result App'),
      ),
      body: FutureBuilder(
        future: fetchData(selectedOption ?? ''),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          } else if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          } else {
            List<Map<String, dynamic>> data =
                snapshot.data as List<Map<String, dynamic>>;
            // print('Type of data: ${snapshot.data.runtimeType}');

            return ListView.builder(
              itemCount: data.length,
              itemBuilder: (context, index) {
                Map<String, dynamic> result = data[index];
                print('Result for index $index: $result');
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('X bar: ${result['xbar'].toString()}'),
                    Text('Stdev Overall: ${result['sd'].toString()}'),
                    Text('Pp: ${result['pp'].toString()}'),
                    Text('Ppu: ${result['ppu'].toString()}'),
                    Text('Ppl: ${result['ppl'].toString()}'),
                    Text('Ppk: ${result['ppk'].toString()}'),
                    Text('Rbar: ${result['rbar'].toString()}'),
                    Text('Stdev Within: ${result['sdw'].toString()}'),
                    Text('Cp: ${result['cp'].toString()}'),
                    Text('Cpu: ${result['cpu'].toString()}'),
                    Text('Cpl: ${result['cpl'].toString()}'),
                    Text('Cpk: ${result['cpk'].toString()}'),
                    Text('ucl: ${result['ucl'].toString()}'),
                    Text('lcl: ${result['lcl'].toString()}'),
                  ],
                );
              },
            );
          }
        },
      ),
    );
  }

  _getData() async {
    SharedPreferences sharedPreferences = await SharedPreferences.getInstance();
    selectedOption = sharedPreferences.getString("spc_option") ?? "0";
    print("Selected Data : $selectedOption");
    setState(() {});
  }
}
